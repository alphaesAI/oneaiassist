import 'dotenv/config';
import { LaneManager } from '../whatsapp-engine/agents/LaneManager';

async function testConcurrencyLock() {
  console.log('--- GATE 2.4: Per-Customer Sequential Concurrency Lock Test ---');

  const tenantId = 'tenant_pme_ff9xl';
  const customerPhone = '+15552223333';
  const executionOrder: number[] = [];

  // Launch two tasks simultaneously for the same customer lane
  // Task 1 has a simulated artificial delay of 80ms
  const task1 = LaneManager.runInLane(tenantId, customerPhone, async () => {
    console.log('Task 1 started (simulating 80ms async turn)...');
    await new Promise((resolve) => setTimeout(resolve, 80));
    executionOrder.push(1);
    console.log('Task 1 completed.');
    return 'Turn 1 done';
  });

  // Task 2 has a shorter simulated delay of 10ms
  const task2 = LaneManager.runInLane(tenantId, customerPhone, async () => {
    console.log('Task 2 started (simulating 10ms async turn)...');
    await new Promise((resolve) => setTimeout(resolve, 10));
    executionOrder.push(2);
    console.log('Task 2 completed.');
    return 'Turn 2 done';
  });

  const [res1, res2] = await Promise.all([task1, task2]);

  console.log('Execution order array:', executionOrder);
  console.log('Task results:', { res1, res2 });

  if (executionOrder[0] === 1 && executionOrder[1] === 2) {
    console.log('✅ GATE 2.4 PASSED: In-memory customer lane mutex enforced strict FIFO sequential execution.');
  } else {
    throw new Error(`Gate 2.4 FAILED: Tasks executed out of order: ${JSON.stringify(executionOrder)}`);
  }
}

testConcurrencyLock().catch((err) => {
  console.error('❌ Gate 2.4 execution failed:', err);
  process.exit(1);
});
