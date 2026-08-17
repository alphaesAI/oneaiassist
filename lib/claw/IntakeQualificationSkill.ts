import { prisma } from '../db';

export class IntakeQualificationSkill {
  static async runTurn(params: {
    tenantId: string;
    lead: any;
    conversation: any;
    history: any[];
    aiClient: any;
    db: any;
    io?: any;
  }): Promise<string> {
    const { tenantId, lead, conversation, history, aiClient, db, io } = params;

    // 1. Fetch or create stateful IntakeSession for this Lead
    let session = await db.intakeSession.findUnique({
      where: { leadId: lead.id },
    });

    if (!session) {
      session = await db.intakeSession.create({
        data: {
          tenantId,
          leadId: lead.id,
          customerId: conversation.customerId,
          flowId: 'default-intake',
          flowVersion: '1.0',
          collectedFields: {},
          status: 'IN_PROGRESS',
        },
      });
      console.log(`[OpenClaw] Created new stateful IntakeSession for lead ${lead.id}`);
    }

    // Get current fields state
    const currentFields = (session.collectedFields as any) || {};
    const updatedFields = { ...currentFields };

    // 2. Parse any new fields or check for human handoff request from user's latest message
    const userMessage = history[history.length - 1]?.content || '';
    const userMessageLow = userMessage.toLowerCase();
    const isHumanRequest = userMessageLow.includes('human') || 
                           userMessageLow.includes('agent') || 
                           userMessageLow.includes('representative') || 
                           userMessageLow.includes('speak to a person') || 
                           userMessageLow.includes('speak to someone');

    if (isHumanRequest) {
      console.log(`[OpenClaw] Human agent requested mid-flow for lead ${lead.id}. Triggering handoff...`);
      // Update Lead status to HANDED_OFF
      await db.lead.update({
        where: { id: lead.id },
        data: { status: 'HANDED_OFF' },
      });
      // Toggle needsEscalation on conversation
      await db.conversation.update({
        where: { id: conversation.id },
        data: { needsEscalation: true },
      });
      // Emit socket event to dashboard
      if (io) {
        io.to(`tenant_${tenantId}`).emit('lead_status_updated', {
          leadId: lead.id,
          status: 'HANDED_OFF',
        });
        io.to(`tenant_${tenantId}`).emit('whatsapp_status_update', {
          conversationId: conversation.id,
          needsEscalation: true,
        });
      }
      return "I've paused our automated intake session and notified a human agent to take over. They will respond to you here shortly.";
    }

    if (userMessage && history[history.length - 1]?.role === 'user') {
      try {
        const extractPrompt = `You are a data extraction bot. Your job is to extract insurance qualification fields from the user message.
Extract these fields if present in the message:
- age (integer number)
- state (2-letter US state code, uppercase)
- healthConditions (pre-existing health conditions or 'None')
- budgetMin (integer monthly premium min budget in dollars)
- budgetMax (integer monthly premium max budget in dollars)
- familySize (integer family members to be covered)

User message: "${userMessage}"

Respond ONLY with a JSON object. Do not include markdown wraps or anything else.
Example: {"age": 35, "state": "TX"}`;

        const rawExtract = await aiClient.generateChat([
          { role: 'user', content: extractPrompt }
        ]);

        let cleanJson = rawExtract.trim();
        if (cleanJson.startsWith('```')) {
          const lines = cleanJson.split('\n');
          if (lines[0].startsWith('```')) lines.shift();
          if (lines[lines.length - 1].startsWith('```')) lines.pop();
          cleanJson = lines.join('\n').trim();
        }

        const extracted = JSON.parse(cleanJson);
        console.log(`[OpenClaw] Extracted fields from user message:`, extracted);

        // Apply validations (Never write to Prisma directly - use stubs/validated variables)
        if (extracted.age && typeof extracted.age === 'number' && extracted.age > 0) {
          updatedFields.age = extracted.age;
        }
        if (extracted.state && typeof extracted.state === 'string' && extracted.state.trim().length === 2) {
          updatedFields.state = extracted.state.trim().toUpperCase();
        }
        if (extracted.healthConditions) {
          updatedFields.healthConditions = Array.isArray(extracted.healthConditions)
            ? extracted.healthConditions
            : [String(extracted.healthConditions)];
        }
        if (extracted.budgetMin && typeof extracted.budgetMin === 'number' && extracted.budgetMin > 0) {
          updatedFields.budgetMin = extracted.budgetMin;
        }
        if (extracted.budgetMax && typeof extracted.budgetMax === 'number' && extracted.budgetMax > 0) {
          updatedFields.budgetMax = extracted.budgetMax;
        }
        if (extracted.familySize && typeof extracted.familySize === 'number' && extracted.familySize > 0) {
          updatedFields.familySize = extracted.familySize;
        }

        // Update database with merged fields state
        session = await db.intakeSession.update({
          where: { id: session.id },
          data: { collectedFields: updatedFields },
        });

        // Emit real-time progress update event via Socket.io
        if (io) {
          const requiredFields = ['age', 'state', 'healthConditions', 'budgetMin', 'budgetMax', 'familySize'];
          const collected = Object.keys(updatedFields).filter(
            (key) => requiredFields.includes(key) && updatedFields[key] !== undefined
          );
          const progress = `${collected.length} of ${requiredFields.length}`;

          io.to(`tenant_${tenantId}`).emit('intake_progress_updated', {
            leadId: lead.id,
            collectedFields: updatedFields,
            progress,
          });
          console.log(`[OpenClaw] Emitted intake_progress_updated for lead ${lead.id}: ${progress}`);
        }
      } catch (err) {
        console.warn(`[OpenClaw] Error parsing or validating extracted data:`, err);
      }
    }

    // 3. Evaluate if qualification parameters are fully satisfied
    const isComplete =
      updatedFields.age !== undefined &&
      updatedFields.state !== undefined &&
      updatedFields.healthConditions !== undefined &&
      updatedFields.budgetMin !== undefined &&
      updatedFields.budgetMax !== undefined &&
      updatedFields.familySize !== undefined;

    if (isComplete) {
      console.log(`[OpenClaw] Intake qualification parameters satisfied for lead ${lead.id}. Calling handoff API...`);

      let matchingPolicies: any[] = [];
      try {
        const port = process.env.PORT || 3002;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
        const completeRes = await fetch(`${baseUrl}/api/bot/intake/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            leadId: lead.id,
            intake: updatedFields,
          }),
        });

        if (completeRes.ok) {
          const resData = await completeRes.json();
          matchingPolicies = resData.matchingPolicies || [];
        } else {
          const errMsg = await completeRes.text();
          console.error(`[OpenClaw] Handoff API call failed with status: ${completeRes.status}, error: ${errMsg}`);
        }
      } catch (err) {
        console.error('[OpenClaw] Failed to call handoff API:', err);
      }

      if (!matchingPolicies.length) {
        const budgetMinCents = Math.round((updatedFields.budgetMin || 0) * 100);
        const budgetMaxCents = Math.round((updatedFields.budgetMax || 0) * 100);
        
        await db.intakeSession.update({
          where: { id: session.id },
          data: { status: 'COMPLETED', completedAt: new Date(), collectedFields: updatedFields },
        });

        const catalogMatches = await db.policyCatalogItem.findMany({
          where: {
            active: true,
            states: { has: updatedFields.state },
            premiumMin: { lte: budgetMaxCents },
            premiumMax: { gte: budgetMinCents },
          },
        });
        matchingPolicies = catalogMatches;

        await db.lead.update({
          where: { id: lead.id },
          data: {
            status: 'QUALIFIED',
            intakeAge: updatedFields.age,
            intakeState: updatedFields.state,
            intakeHealthConditions: updatedFields.healthConditions,
            intakeBudgetMin: budgetMinCents,
            intakeBudgetMax: budgetMaxCents,
            intakeFamilySize: updatedFields.familySize,
            recommendedPolicyIds: catalogMatches.map(p => p.id),
          },
        });
      }

      // Format recommendation payload for final explanation response
      let policiesPrompt = `I have qualified the lead and matched the following matching policies in the catalog:\n`;
      if (matchingPolicies.length === 0) {
        policiesPrompt += `No matching policies found for state ${updatedFields.state} and budget $${updatedFields.budgetMin}-$${updatedFields.budgetMax}.\n`;
      } else {
        for (const p of matchingPolicies) {
          policiesPrompt += `- Plan: ${p.name}, Insurer: ${p.insurerName}, Monthly Premium: $${(p.premiumMin / 100).toFixed(2)}-$${(p.premiumMax / 100).toFixed(2)}, Sum Insured: $${(p.sumInsured / 100).toLocaleString()}, Summary: ${p.extractedSummary}\n`;
        }
      }
      policiesPrompt += `\nPlease explain these options to the user in a very warm, plain language summary (premiums, sum insured, exclusions, waiting periods). Ask which plan they would prefer.`;

      const botReplyText = await aiClient.generateChat([
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: policiesPrompt },
      ]);

      return botReplyText;
    }

    // 4. If fields are missing, request the next missing one in conversational turn
    const missing: string[] = [];
    if (updatedFields.age === undefined) missing.push('Age (number of years)');
    if (updatedFields.state === undefined) missing.push('US State of residence (2-letter abbreviation)');
    if (updatedFields.healthConditions === undefined) missing.push('pre-existing conditions (write None if none)');
    if (updatedFields.budgetMin === undefined || updatedFields.budgetMax === undefined) {
      missing.push('monthly premium budget limits (min and max monthly amount in dollars)');
    }
    if (updatedFields.familySize === undefined) missing.push('family size (total members covered including yourself)');

    const prompt = `You are a professional insurance sales agent guide assisting a lead over WhatsApp.
Your goal is to guide the conversation to collect 5 qualification details:
1. Age
2. US State of residence
3. Pre-existing health conditions
4. Monthly premium budget (min and max monthly amount in dollars)
5. Family size

Already collected: ${JSON.stringify(updatedFields)}.
Remaining missing fields: ${missing.join(', ')}.

Ask a polite, warm question over WhatsApp requesting the next missing parameter: "${missing[0]}". Do not ask for everything at once. Keep the tone human-friendly.`;

    const botReplyText = await aiClient.generateChat([
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: prompt },
    ]);

    return botReplyText;
  }
}
