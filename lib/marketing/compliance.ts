export type Severity = 'CRITICAL' | 'WARNING' | 'PASS';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
}

export interface AuditRule {
  phrase: string;
  severity: string;
  rule: string;
  message: string;
}

export interface AuditResult {
  score: number;
  findings: Finding[];
  hasCritical: boolean;
}

// Starting set for any business. Editable per workspace. Not legal advice and not a
// substitute for each platform's current advertising policy.
export const DEFAULT_RULES: AuditRule[] = [
  { phrase: 'guaranteed results', severity: 'CRITICAL', rule: 'Unrealistic outcomes', message: 'Do not promise guaranteed results.' },
  { phrase: 'get rich quick', severity: 'CRITICAL', rule: 'Unrealistic outcomes', message: 'Get-rich-quick claims are prohibited by most ad platforms.' },
  { phrase: 'risk free', severity: 'WARNING', rule: 'Unrealistic outcomes', message: 'Check that "risk free" is accurate and can be backed up.' },
  { phrase: '100% free', severity: 'WARNING', rule: 'Misleading claims', message: 'Make sure there are no hidden costs or conditions.' },
  { phrase: 'best in the world', severity: 'WARNING', rule: 'Misleading claims', message: 'Superlative claims need evidence.' },
  { phrase: 'tag a friend', severity: 'WARNING', rule: 'Engagement bait', message: 'Platforms reduce the reach of engagement bait.' },
  { phrase: 'like and share', severity: 'WARNING', rule: 'Engagement bait', message: 'Platforms reduce the reach of engagement bait.' },
  { phrase: 'are you overweight', severity: 'CRITICAL', rule: 'Personal attributes', message: 'Ads must not assert or imply personal attributes of the reader.' },
  { phrase: 'are you broke', severity: 'CRITICAL', rule: 'Personal attributes', message: 'Ads must not assert or imply personal attributes of the reader.' },
];

const CRITICAL_PENALTY = 30;
const WARNING_PENALTY = 10;

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whole words only, so a rule for "cure" does not fire on "secure"
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
}

export function auditCaption(caption: string, rules: AuditRule[]): AuditResult {
  const findings: Finding[] = [];
  const text = caption.toLowerCase();

  for (const rule of rules) {
    if (containsPhrase(text, rule.phrase)) {
      findings.push({
        rule: rule.rule,
        severity: rule.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        message: `"${rule.phrase}": ${rule.message}`,
      });
    }
  }

  const letters = caption.replace(/[^\p{L}]/gu, '');
  const upper = caption.replace(/[^\p{Lu}]/gu, '');
  if (letters.length >= 20 && upper.length / letters.length > 0.7) {
    findings.push({ rule: 'Style', severity: 'WARNING', message: 'Mostly capital letters reads as shouting and can hurt delivery.' });
  }
  if (/[!?]{3,}/.test(caption)) {
    findings.push({ rule: 'Style', severity: 'WARNING', message: 'Repeated punctuation looks like spam.' });
  }

  const score = Math.max(
    0,
    100 - findings.reduce((sum, f) => sum + (f.severity === 'CRITICAL' ? CRITICAL_PENALTY : WARNING_PENALTY), 0),
  );
  const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
  if (findings.length === 0) {
    findings.push({ rule: 'Rule check', severity: 'PASS', message: 'No configured rule matched.' });
  }
  return { score, findings, hasCritical };
}
