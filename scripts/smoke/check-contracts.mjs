import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

let hasError = false;

function reportError(message, error) {
  console.error(`[smoke:contracts] ${message}`);
  if (error) {
    console.error(`[smoke:contracts] ${error instanceof Error ? error.message : String(error)}`);
  }
  hasError = true;
}

function checkSharedContracts() {
  try {
    const shared = require(resolve("packages/shared/dist/index.js"));

    assert.equal(shared.TRANSCRIPTION_JOB_NAME, "transcription.process");
    assert.deepEqual(shared.OUTPUT_FORMATS, ["txt", "srt", "pdf"]);
    assert.ok(shared.JOB_STATUSES.includes("queued"));
    assert.ok(shared.JOB_STATUSES.includes("completed"));
    assert.ok(shared.ACCEPTED_UPLOAD_EXTENSIONS.includes("mp3"));

    console.log("[smoke:contracts] OK shared contracts.");
  } catch (error) {
    reportError(
      "Failed to validate packages/shared/dist/index.js. Run build before smoke checks.",
      error
    );
  }
}

async function checkApiMarkers() {
  try {
    const source = await readFile(resolve("apps/api/src/index.ts"), "utf8");
    assert.match(source, /app\.get\(\s*"\/health"/m);
    assert.match(source, /app\.post\(\s*"\/v1\/transcriptions"/m);
    assert.match(source, /app\.get\(\s*"\/v1\/transcriptions\/:id\/download"/m);
    console.log("[smoke:contracts] OK api route markers.");
  } catch (error) {
    reportError("API critical route markers are missing.", error);
  }
}

async function checkWorkerMarkers() {
  try {
    const source = await readFile(resolve("apps/worker/src/index.ts"), "utf8");
    assert.ok(source.includes("TRANSCRIPTION_JOB_NAME"));
    assert.ok(source.includes("renderSrtText"));
    assert.ok(source.includes("transcribeWithOpenAi"));
    console.log("[smoke:contracts] OK worker processing markers.");
  } catch (error) {
    reportError("Worker critical processing markers are missing.", error);
  }
}

async function checkWebMarkers() {
  try {
    const source = await readFile(resolve("apps/web/src/main.tsx"), "utf8");
    assert.ok(source.includes("BrowserRouter"));
    assert.ok(source.includes("<App />"));
    console.log("[smoke:contracts] OK web bootstrap markers.");
  } catch (error) {
    reportError("Web bootstrap markers are missing.", error);
  }
}

checkSharedContracts();
await checkApiMarkers();
await checkWorkerMarkers();
await checkWebMarkers();

if (hasError) {
  process.exit(1);
}

console.log("[smoke:contracts] All checks passed.");
