import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3333";
const pollTimeoutMs = Number.parseInt(process.env.E2E_POLL_TIMEOUT_MS ?? "90000", 10);
const pollIntervalMs = Number.parseInt(process.env.E2E_POLL_INTERVAL_MS ?? "2000", 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        const payload = await response.json();
        if (payload?.status === "ok") {
          console.log("[smoke:e2e] API health is ready.");
          return;
        }
      }
    } catch {
      // Keep waiting.
    }
    await sleep(pollIntervalMs);
  }

  throw new Error("API did not become healthy in time.");
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { response, payload };
}

function ensureOk(response, payload, stepName) {
  if (!response.ok) {
    const errorPayload = payload ? JSON.stringify(payload) : "<no-json-body>";
    throw new Error(`${stepName} failed: HTTP ${response.status} ${errorPayload}`);
  }
}

async function registerUser() {
  const email = `smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const body = {
    name: "Smoke User",
    email,
    password: "SmokePass123!"
  };

  const { response, payload } = await requestJson("/v1/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  ensureOk(response, payload, "register");
  assert.ok(payload?.accessToken, "register response missing accessToken");

  console.log("[smoke:e2e] User registration succeeded.");
  return payload.accessToken;
}

async function presignUpload(accessToken) {
  const body = {
    fileName: "smoke-input.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 256
  };

  const { response, payload } = await requestJson("/v1/uploads/presign", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  ensureOk(response, payload, "presign upload");
  assert.ok(payload?.uploadUrl, "presign response missing uploadUrl");
  assert.ok(payload?.objectKey, "presign response missing objectKey");
  console.log("[smoke:e2e] Upload URL presign succeeded.");
  return payload;
}

async function uploadMedia(presignPayload) {
  const audioBytes = new Uint8Array(256);
  for (let i = 0; i < audioBytes.length; i += 1) {
    audioBytes[i] = i % 251;
  }

  const uploadResponse = await fetch(presignPayload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": presignPayload.requiredHeaders?.["content-type"] ?? "audio/mpeg"
    },
    body: audioBytes
  });

  if (!uploadResponse.ok) {
    let responseText = "";
    try {
      responseText = await uploadResponse.text();
    } catch {
      responseText = "";
    }
    throw new Error(
      `direct upload failed: HTTP ${uploadResponse.status} ${responseText || "<empty-body>"}`
    );
  }

  console.log("[smoke:e2e] Direct upload succeeded.");
}

async function createTranscription(accessToken, sourceObjectKey) {
  const body = {
    sourceObjectKey,
    language: "pt-BR"
  };

  const { response, payload } = await requestJson("/v1/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  ensureOk(response, payload, "create transcription");
  assert.ok(payload?.job?.id, "create transcription response missing job.id");
  console.log(`[smoke:e2e] Transcription enqueued (${payload.job.id}).`);
  return payload.job.id;
}

async function waitForCompletion(accessToken, jobId) {
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    const { response, payload } = await requestJson(`/v1/transcriptions/${jobId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    ensureOk(response, payload, "get transcription detail");

    const status = payload?.job?.status;
    if (status === "completed") {
      console.log(`[smoke:e2e] Job ${jobId} completed.`);
      return payload.job;
    }
    if (status === "failed") {
      throw new Error(
        `job ${jobId} failed: ${payload?.job?.errorCode ?? "unknown"} ${payload?.job?.errorMessage ?? ""}`
      );
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`job ${jobId} did not complete in time`);
}

async function verifyDownloads(accessToken, jobId) {
  for (const format of ["txt", "srt"]) {
    const response = await fetch(`${apiBaseUrl}/v1/transcriptions/${jobId}/download?format=${format}`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      let text = "";
      try {
        text = await response.text();
      } catch {
        text = "";
      }
      throw new Error(`download ${format} failed: HTTP ${response.status} ${text || "<empty-body>"}`);
    }

    const textBody = await response.text();
    assert.ok(textBody.length > 0, `download ${format} returned empty body`);
    console.log(`[smoke:e2e] Download ${format} succeeded.`);
  }
}

async function main() {
  console.log(`[smoke:e2e] Starting E2E smoke against ${apiBaseUrl}`);
  await waitForHealth();

  const accessToken = await registerUser();
  const presignPayload = await presignUpload(accessToken);
  await uploadMedia(presignPayload);
  const jobId = await createTranscription(accessToken, presignPayload.objectKey);
  await waitForCompletion(accessToken, jobId);
  await verifyDownloads(accessToken, jobId);

  console.log("[smoke:e2e] End-to-end smoke completed successfully.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[smoke:e2e] FAILED\n${message}`);
  process.exit(1);
});
