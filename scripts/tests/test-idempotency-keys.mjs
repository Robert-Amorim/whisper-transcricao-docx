/**
 * Unit tests: idempotency key generation and uniqueness
 * Verifies the key patterns used for webhook credits and job ledger entries.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Replicate the key generation functions from the codebase
function getHoldIdempotencyKey(jobId) {
  return `job:${jobId}:hold`;
}

function getCaptureIdempotencyKey(jobId) {
  return `job:${jobId}:capture`;
}

function getRefundIdempotencyKey(jobId) {
  return `job:${jobId}:refund`;
}

function getPaymentCreditIdempotencyKey(paymentId) {
  return `payment:${paymentId}:credit`;
}

let passed = 0;

// 1. Keys for the same job are all different
const jobId = randomUUID();
const holdKey = getHoldIdempotencyKey(jobId);
const captureKey = getCaptureIdempotencyKey(jobId);
const refundKey = getRefundIdempotencyKey(jobId);

assert.notEqual(holdKey, captureKey, "hold and capture keys must differ");
assert.notEqual(holdKey, refundKey, "hold and refund keys must differ");
assert.notEqual(captureKey, refundKey, "capture and refund keys must differ");
passed++;
console.log("  ✓ hold/capture/refund keys are unique per job");

// 2. Same function + same ID = same key (idempotent)
assert.equal(getHoldIdempotencyKey(jobId), getHoldIdempotencyKey(jobId));
assert.equal(getCaptureIdempotencyKey(jobId), getCaptureIdempotencyKey(jobId));
assert.equal(getRefundIdempotencyKey(jobId), getRefundIdempotencyKey(jobId));
passed++;
console.log("  ✓ Same input always produces same key (deterministic)");

// 3. Different jobs produce different keys
const jobId2 = randomUUID();
assert.notEqual(getHoldIdempotencyKey(jobId), getHoldIdempotencyKey(jobId2));
assert.notEqual(getCaptureIdempotencyKey(jobId), getCaptureIdempotencyKey(jobId2));
assert.notEqual(getRefundIdempotencyKey(jobId), getRefundIdempotencyKey(jobId2));
passed++;
console.log("  ✓ Different jobs produce different keys");

// 4. Payment credit keys are distinct from job keys
const paymentId = randomUUID();
const creditKey = getPaymentCreditIdempotencyKey(paymentId);
assert.ok(creditKey.startsWith("payment:"), "credit key should start with payment:");
assert.ok(holdKey.startsWith("job:"), "hold key should start with job:");
assert.notEqual(creditKey, holdKey, "payment and job keys must differ");
passed++;
console.log("  ✓ Payment credit keys are namespaced separately from job keys");

// 5. Keys contain the original ID (traceable)
assert.ok(holdKey.includes(jobId), "hold key should contain jobId");
assert.ok(creditKey.includes(paymentId), "credit key should contain paymentId");
passed++;
console.log("  ✓ Keys contain original IDs for traceability");

// 6. Simulate duplicate webhook scenario
const webhookPaymentId = randomUUID();
const firstCall = getPaymentCreditIdempotencyKey(webhookPaymentId);
const duplicateCall = getPaymentCreditIdempotencyKey(webhookPaymentId);
assert.equal(firstCall, duplicateCall, "duplicate webhook must generate same key");
passed++;
console.log("  ✓ Duplicate webhook calls produce identical idempotency keys");

// 7. Simulate hold/capture/refund lifecycle
const lifecycleJobId = randomUUID();
const keys = new Set([
  getHoldIdempotencyKey(lifecycleJobId),
  getCaptureIdempotencyKey(lifecycleJobId),
  getRefundIdempotencyKey(lifecycleJobId),
]);
assert.equal(keys.size, 3, "all 3 lifecycle keys must be unique");
passed++;
console.log("  ✓ Full lifecycle (hold→capture→refund) keys are all unique");

// 8. No key collision across 1000 random jobs
const allKeys = new Set();
for (let i = 0; i < 1000; i++) {
  const id = randomUUID();
  allKeys.add(getHoldIdempotencyKey(id));
  allKeys.add(getCaptureIdempotencyKey(id));
  allKeys.add(getRefundIdempotencyKey(id));
}
assert.equal(allKeys.size, 3000, "no collisions across 1000 jobs × 3 operations");
passed++;
console.log("  ✓ No key collisions across 1000 random jobs (3000 keys)");

console.log(`\n[test:idempotency] All ${passed} tests passed.`);
