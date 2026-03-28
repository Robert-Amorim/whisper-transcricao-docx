/**
 * Unit tests: hold/capture/refund wallet state machine
 * Simulates ledger operations in-memory to verify invariants.
 */
import assert from "node:assert/strict";

class WalletSimulator {
  constructor(initialBalance) {
    this.availableBalance = initialBalance;
    this.heldBalance = 0;
    this.ledger = [];
    this.idempotencyKeys = new Set();
  }

  hold(jobId, amount) {
    const key = `job:${jobId}:hold`;
    if (this.idempotencyKeys.has(key)) return { applied: false, reason: "duplicate" };
    if (this.availableBalance < amount) return { applied: false, reason: "insufficient" };

    this.availableBalance -= amount;
    this.heldBalance += amount;
    this.ledger.push({ type: "hold", jobId, amount, key });
    this.idempotencyKeys.add(key);
    return { applied: true };
  }

  capture(jobId, amount) {
    const key = `job:${jobId}:capture`;
    if (this.idempotencyKeys.has(key)) return { applied: false, reason: "duplicate" };
    if (this.heldBalance < amount) return { applied: false, reason: "insufficient_held" };

    this.heldBalance -= amount;
    this.ledger.push({ type: "capture", jobId, amount, key });
    this.idempotencyKeys.add(key);
    return { applied: true };
  }

  refund(jobId, amount) {
    const key = `job:${jobId}:refund`;
    if (this.idempotencyKeys.has(key)) return { applied: false, reason: "duplicate" };
    // Cannot refund if already captured
    if (this.idempotencyKeys.has(`job:${jobId}:capture`)) return { applied: false, reason: "already_captured" };
    // Cannot refund if no hold
    if (!this.idempotencyKeys.has(`job:${jobId}:hold`)) return { applied: false, reason: "no_hold" };
    if (this.heldBalance < amount) return { applied: false, reason: "insufficient_held" };

    this.heldBalance -= amount;
    this.availableBalance += amount;
    this.ledger.push({ type: "refund", jobId, amount, key });
    this.idempotencyKeys.add(key);
    return { applied: true };
  }

  get totalBalance() {
    return this.availableBalance + this.heldBalance;
  }
}

let passed = 0;

// 1. Happy path: hold → capture
{
  const w = new WalletSimulator(10);
  const holdResult = w.hold("job1", 2.7);
  assert.ok(holdResult.applied);
  assert.equal(w.availableBalance, 7.3);
  assert.equal(w.heldBalance, 2.7);

  const captureResult = w.capture("job1", 2.7);
  assert.ok(captureResult.applied);
  assert.equal(w.availableBalance, 7.3);
  assert.equal(w.heldBalance, 0);
  assert.equal(w.totalBalance, 7.3);
  passed++;
  console.log("  ✓ Happy path: hold → capture (balance correct)");
}

// 2. Failure path: hold → refund
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  const refundResult = w.refund("job1", 2.7);
  assert.ok(refundResult.applied);
  assert.equal(w.availableBalance, 10);
  assert.equal(w.heldBalance, 0);
  assert.equal(w.totalBalance, 10);
  passed++;
  console.log("  ✓ Failure path: hold → refund (full balance restored)");
}

// 3. Insufficient balance blocks hold
{
  const w = new WalletSimulator(1);
  const result = w.hold("job1", 2.7);
  assert.ok(!result.applied);
  assert.equal(result.reason, "insufficient");
  assert.equal(w.availableBalance, 1);
  assert.equal(w.heldBalance, 0);
  passed++;
  console.log("  ✓ Insufficient balance blocks hold");
}

// 4. Duplicate hold is idempotent (no double deduction)
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  const dup = w.hold("job1", 2.7);
  assert.ok(!dup.applied);
  assert.equal(dup.reason, "duplicate");
  assert.equal(w.availableBalance, 7.3);
  assert.equal(w.heldBalance, 2.7);
  passed++;
  console.log("  ✓ Duplicate hold is idempotent (no double deduction)");
}

// 5. Duplicate capture is idempotent
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  w.capture("job1", 2.7);
  const dup = w.capture("job1", 2.7);
  assert.ok(!dup.applied);
  assert.equal(dup.reason, "duplicate");
  assert.equal(w.heldBalance, 0);
  passed++;
  console.log("  ✓ Duplicate capture is idempotent");
}

// 6. Duplicate refund is idempotent
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  w.refund("job1", 2.7);
  const dup = w.refund("job1", 2.7);
  assert.ok(!dup.applied);
  assert.equal(dup.reason, "duplicate");
  assert.equal(w.availableBalance, 10);
  passed++;
  console.log("  ✓ Duplicate refund is idempotent");
}

// 7. Cannot refund after capture
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  w.capture("job1", 2.7);
  const result = w.refund("job1", 2.7);
  assert.ok(!result.applied);
  assert.equal(result.reason, "already_captured");
  passed++;
  console.log("  ✓ Cannot refund after capture");
}

// 8. Cannot refund without hold
{
  const w = new WalletSimulator(10);
  const result = w.refund("job1", 2.7);
  assert.ok(!result.applied);
  assert.equal(result.reason, "no_hold");
  passed++;
  console.log("  ✓ Cannot refund without hold");
}

// 9. Multiple concurrent jobs
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  w.hold("job2", 3.0);
  assert.equal(w.availableBalance, 4.3);
  assert.equal(w.heldBalance, 5.7);

  w.capture("job1", 2.7); // job1 succeeds
  w.refund("job2", 3.0);  // job2 fails

  assert.equal(w.availableBalance, 7.3);
  assert.equal(w.heldBalance, 0);
  assert.equal(w.totalBalance, 7.3);
  passed++;
  console.log("  ✓ Multiple concurrent jobs: capture one, refund another");
}

// 10. Total balance invariant: available + held never exceeds initial + credits
{
  const w = new WalletSimulator(100);
  const jobs = Array.from({ length: 20 }, (_, i) => `job-${i}`);

  for (const jobId of jobs) {
    w.hold(jobId, 2.7);
  }
  // 20 * 2.7 = 54 held
  assert.ok(Math.abs(w.totalBalance - 100) < 1e-10, `total should be ~100, got ${w.totalBalance}`);

  // Capture half, refund half
  for (let i = 0; i < 10; i++) w.capture(jobs[i], 2.7);
  for (let i = 10; i < 20; i++) w.refund(jobs[i], 2.7);

  assert.ok(Math.abs(w.heldBalance) < 1e-10, `held should be ~0, got ${w.heldBalance}`);
  const expectedTotal = 100 - 10 * 2.7;
  assert.ok(
    Math.abs(w.totalBalance - expectedTotal) < 1e-10,
    `total balance ${w.totalBalance} should be ~${expectedTotal}`
  );
  passed++;
  console.log("  ✓ Balance invariant holds across 20 jobs (10 captured, 10 refunded)");
}

// 11. Ledger audit trail
{
  const w = new WalletSimulator(10);
  w.hold("job1", 2.7);
  w.capture("job1", 2.7);

  assert.equal(w.ledger.length, 2);
  assert.equal(w.ledger[0].type, "hold");
  assert.equal(w.ledger[1].type, "capture");
  assert.ok(w.ledger.every((e) => e.jobId === "job1"));
  passed++;
  console.log("  ✓ Ledger records correct audit trail");
}

console.log(`\n[test:hold-capture-refund] All ${passed} tests passed.`);
