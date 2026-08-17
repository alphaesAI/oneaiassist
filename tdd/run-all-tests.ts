import { execSync } from 'child_process';
import path from 'path';

const testFiles = [
  'test-openclaw-prompts-2-5.ts',
  'test-openclaw-e2e.ts',
  'test_isolation.ts',
  'test-ai-usage.ts',
  'test-inbox-verification.ts',
  'test-kpi-verification.ts',
  'test-onboarding.ts',
  'test_ai_agent.ts',
  'test_portal_checkout_e2e.ts',
  'test_rag.ts',
  'test_rls_raw.ts',
  'test_whatsapp.ts',
  'test_widget.ts',
];

const results: { file: string; status: 'PASS' | 'FAIL'; durationMs: number; error?: string }[] = [];

console.log('\x1b[36m\x1b[1m=== ONE AI ASSIST PRE-DEPLOYMENT TDD TEST SUITE RUNNER ===\x1b[0m\n');

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\x1b[33m[RUNNING]\x1b[0m ${file}...`);
  const startTime = Date.now();

  try {
    execSync(`npx tsx "${filePath}"`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    const durationMs = Date.now() - startTime;
    results.push({ file, status: 'PASS', durationMs });
    console.log(`\x1b[32m[PASS]\x1b[0m ${file} (${durationMs}ms)\n`);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    results.push({ file, status: 'FAIL', durationMs, error: err?.message });
    console.log(`\x1b[31m[FAIL]\x1b[0m ${file} (${durationMs}ms)\n`);
  }
}

console.log('\n\x1b[36m\x1b[1m=======================================================');
console.log('              PRE-DEPLOYMENT SUMMARY REPORT              ');
console.log('=======================================================\x1b[0m');

let passCount = 0;
let failCount = 0;

for (const r of results) {
  if (r.status === 'PASS') {
    passCount++;
    console.log(` \x1b[32m[PASS]\x1b[0m  ${r.file.padEnd(35)} (${r.durationMs}ms)`);
  } else {
    failCount++;
    console.log(` \x1b[31m[FAIL]\x1b[0m  ${r.file.padEnd(35)} (${r.durationMs}ms)`);
  }
}

console.log('\x1b[36m-------------------------------------------------------\x1b[0m');
console.log(`Total Test Files: ${results.length} | Passed: \x1b[32m${passCount}\x1b[0m | Failed: \x1b[31m${failCount}\x1b[0m`);

if (failCount > 0) {
  console.log('\x1b[31m\x1b[1m\n❌ Deployment Gate Check Failed: Please resolve failing tests before deploying.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m\x1b[1m\n✅ Deployment Gate Check Passed: All test suites passed successfully!\x1b[0m');
  process.exit(0);
}
