/**
 * Unit tests: job status transitions
 * Valid transitions:
 *   uploaded → validating → processing → completed
 *                                      → failed
 *   uploaded → validating → failed (validation error)
 */
import assert from "node:assert/strict";

const JOB_STATUSES = ["uploaded", "validating", "queued", "processing", "completed", "failed"];

const VALID_TRANSITIONS = {
  uploaded: ["validating"],
  validating: ["processing", "failed"],
  processing: ["completed", "failed"],
  queued: ["processing", "failed"],
  completed: [],
  failed: [],
};

function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

let passed = 0;

// Valid transitions
const validPaths = [
  ["uploaded", "validating"],
  ["validating", "processing"],
  ["processing", "completed"],
  ["processing", "failed"],
  ["validating", "failed"],
  ["queued", "processing"],
  ["queued", "failed"],
];

for (const [from, to] of validPaths) {
  assert.ok(isValidTransition(from, to), `${from} → ${to} should be valid`);
  passed++;
  console.log(`  ✓ ${from} → ${to} (valid)`);
}

// Invalid transitions
const invalidPaths = [
  ["uploaded", "completed"],
  ["uploaded", "failed"],
  ["uploaded", "processing"],
  ["validating", "uploaded"],
  ["validating", "completed"],
  ["processing", "uploaded"],
  ["processing", "validating"],
  ["completed", "failed"],
  ["completed", "uploaded"],
  ["completed", "processing"],
  ["failed", "uploaded"],
  ["failed", "completed"],
  ["failed", "processing"],
];

for (const [from, to] of invalidPaths) {
  assert.ok(!isValidTransition(from, to), `${from} → ${to} should be invalid`);
  passed++;
  console.log(`  ✓ ${from} → ${to} (blocked)`);
}

// Terminal states have no outgoing transitions
for (const terminal of ["completed", "failed"]) {
  assert.equal(VALID_TRANSITIONS[terminal].length, 0, `${terminal} should be terminal`);
  passed++;
  console.log(`  ✓ ${terminal} is terminal (no outgoing transitions)`);
}

// Happy path: full sequence
const happyPath = ["uploaded", "validating", "processing", "completed"];
for (let i = 0; i < happyPath.length - 1; i++) {
  assert.ok(
    isValidTransition(happyPath[i], happyPath[i + 1]),
    `happy path step ${i}: ${happyPath[i]} → ${happyPath[i + 1]}`
  );
}
passed++;
console.log("  ✓ Happy path: uploaded → validating → processing → completed");

// Failure path: fail during processing
const failPath = ["uploaded", "validating", "processing", "failed"];
for (let i = 0; i < failPath.length - 1; i++) {
  assert.ok(
    isValidTransition(failPath[i], failPath[i + 1]),
    `fail path step ${i}: ${failPath[i]} → ${failPath[i + 1]}`
  );
}
passed++;
console.log("  ✓ Fail path: uploaded → validating → processing → failed");

// All statuses accounted for
assert.equal(JOB_STATUSES.length, 6, "should have 6 job statuses");
for (const status of JOB_STATUSES) {
  assert.ok(status in VALID_TRANSITIONS, `${status} should have transition rules`);
}
passed++;
console.log("  ✓ All 6 statuses have defined transition rules");

console.log(`\n[test:job-states] All ${passed} tests passed.`);
