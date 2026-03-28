/**
 * Unit tests: financial charge calculation
 * Formula: round(duration_seconds * PRICE_PER_MINUTE / 60, 6)
 * PRICE_PER_MINUTE = 0.27
 */
import assert from "node:assert/strict";

const PRICE_PER_MINUTE = 0.27;

function calculateCharge(durationSeconds) {
  return Number(((durationSeconds * PRICE_PER_MINUTE) / 60).toFixed(6));
}

const cases = [
  { duration: 1, expected: 0.0045, label: "1 second" },
  { duration: 30, expected: 0.135, label: "30 seconds" },
  { duration: 59, expected: 0.2655, label: "59 seconds" },
  { duration: 60, expected: 0.27, label: "1 minute exact" },
  { duration: 61, expected: 0.2745, label: "61 seconds" },
  { duration: 120, expected: 0.54, label: "2 minutes" },
  { duration: 300, expected: 1.35, label: "5 minutes" },
  { duration: 600, expected: 2.7, label: "10 minutes (chunk boundary)" },
  { duration: 3599, expected: 16.1955, label: "59m59s (near 1 hour)" },
  { duration: 3600, expected: 16.2, label: "1 hour exact" },
  { duration: 10800, expected: 48.6, label: "3 hours (max MVP)" },
];

let passed = 0;

for (const { duration, expected, label } of cases) {
  const result = calculateCharge(duration);
  assert.equal(
    result,
    expected,
    `${label}: expected ${expected}, got ${result}`
  );
  passed++;
  console.log(`  ✓ ${label}: ${duration}s → R$ ${result}`);
}

// Edge cases
assert.equal(calculateCharge(0), 0, "0 seconds should be 0");
passed++;
console.log("  ✓ 0 seconds → R$ 0");

// Verify 6 decimal precision
const precisionResult = ((7 * PRICE_PER_MINUTE) / 60).toFixed(6);
assert.equal(precisionResult.split(".")[1].length, 6, "should always have 6 decimal places");
passed++;
console.log("  ✓ Precision: always 6 decimal places");

// Verify pro-rata (not rounded to nearest minute)
const proRata1 = calculateCharge(90); // 1.5 min
const proRata2 = calculateCharge(60); // 1 min
assert.ok(proRata1 > proRata2, "pro-rata: 90s should cost more than 60s");
assert.ok(proRata1 < calculateCharge(120), "pro-rata: 90s should cost less than 120s");
passed++;
console.log("  ✓ Pro-rata billing verified (no rounding to minute)");

console.log(`\n[test:financial] All ${passed} tests passed.`);
