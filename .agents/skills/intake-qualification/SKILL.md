---
name: intake-qualification
description: >
  Qualifies lead parameters conversational flow turn-by-turn. Extracts state parameters: Age, US State, Health Conditions, Monthly Budget, and Family Size.
argument-hint: "customerId"
license: MIT
---

# Intake Qualification Skill

This skill coordinates the intake qualification wizard over WhatsApp / Webchat.

## Parameters to Gather
1. **Age**: User's age (must be validated as integer number).
2. **US State**: 2-letter state code of residence (e.g. TX, CA).
3. **Health Conditions**: Pre-existing conditions, defaults to "None" if none.
4. **Premium Budget**: Monthly minimum and maximum budget limit in dollars.
5. **Family Size**: Total family members covered by the policy.

## Functions / API Gateway Tools
- `get_intake_state`: Reads current values from `IntakeSession`.
- `update_intake_field`: Updates field in `IntakeSession.collectedFields`.
- `validate_intake_field`: Standard parameter format validators.
