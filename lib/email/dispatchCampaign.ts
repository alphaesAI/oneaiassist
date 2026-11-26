import { EmailTemplateEngine } from './templateEngine';

export function renderCampaignEmailContent(params: {
  rawBody: string;
  rawSubject: string;
  customer: {
    displayName: string;
    email: string;
    activePolicy?: { policyNumber?: string | null } | null;
  };
  tenant: {
    id: string;
    name?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    postalAddress?: string | null;
  };
  emailConfig?: {
    fromName?: string | null;
    postalAddress?: string | null;
  } | null;
  appOrigin: string;
}): { subject: string; html: string; missingFields: string[] } {
  const { rawBody, rawSubject, customer, tenant, emailConfig, appOrigin } = params;

  const postalAddress =
    tenant.postalAddress?.trim() ||
    emailConfig?.postalAddress?.trim() ||
    [tenant.name, tenant.contactPhone, tenant.contactEmail].filter(Boolean).join(' • ') ||
    'OneAI Assist';

  const dynamicSenderAddress = postalAddress;
  // The real unsubscribe link is signed per recipient when the email is sent (EmailTransportAdapter),
  // so the placeholder is kept here. An unsigned link would be rejected by the unsubscribe endpoint.
  const unsubscribeUrl = '{{unsubscribe_url}}';

  const personalContext = {
    name: customer.displayName,
    first_name: customer.displayName ? customer.displayName.split(' ')[0] : '',
    last_name: customer.displayName ? customer.displayName.split(' ').slice(1).join(' ') : '',
    email: customer.email,
    policy_number: customer.activePolicy?.policyNumber || null,
    unsubscribe_url: unsubscribeUrl,
    sender_address: dynamicSenderAddress,
  };

  const subjectResult = EmailTemplateEngine.renderDetailed(rawSubject, personalContext, { escapeHtml: false });
  const bodyResult = EmailTemplateEngine.renderDetailed(rawBody, personalContext, { escapeHtml: true });

  const missingFields = Array.from(new Set([...subjectResult.missingTags, ...bodyResult.missingTags]));

  const htmlWithCompliance = EmailTemplateEngine.appendComplianceFooter(bodyResult.rendered, {
    unsubscribeUrl,
    postalAddress,
    tenantName: tenant.name || emailConfig?.fromName || 'Our Organization',
  });

  return {
    subject: subjectResult.rendered,
    html: htmlWithCompliance,
    missingFields,
  };
}
