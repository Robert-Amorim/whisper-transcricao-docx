import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3333";
const pollTimeoutMs = Number.parseInt(process.env.E2E_POLL_TIMEOUT_MS ?? "90000", 10);
const pollIntervalMs = Number.parseInt(process.env.E2E_POLL_INTERVAL_MS ?? "2000", 10);
const execFileAsync = promisify(execFile);

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

async function getWallet(accessToken) {
  const { response, payload } = await requestJson("/v1/wallet", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  ensureOk(response, payload, "get wallet");
  return payload;
}

async function createPixPayment(accessToken, amount) {
  const { response, payload } = await requestJson("/v1/payments/pix", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      amount
    })
  });

  ensureOk(response, payload, "create pix payment");
  assert.ok(payload?.payment?.id, "payment response missing id");
  assert.ok(payload?.pix?.providerMode, "payment response missing providerMode");
  console.log(`[smoke:e2e] PIX payment created (${payload.payment.id}).`);
  return payload;
}

async function confirmPixPayment(accessToken, paymentId) {
  const { response, payload } = await requestJson(
    `/v1/payments/${encodeURIComponent(paymentId)}/confirm`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }
  );

  ensureOk(response, payload, "confirm pix payment");
  assert.ok(payload?.payment?.status, "confirm payment response missing status");
  console.log(`[smoke:e2e] PIX payment confirmed (${payload.payment.id}).`);
  return payload;
}

async function createValidSmokeMedia() {
  const workspaceDir = await mkdtemp(join(tmpdir(), "voxora-smoke-"));
  const fileName = "smoke-input.wav";
  const filePath = join(workspaceDir, fileName);

  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=16000:cl=mono",
      "-t",
      "1",
      "-c:a",
      "pcm_s16le",
      filePath,
      "-y"
    ]);

    const buffer = await readFile(filePath);
    return {
      fileName,
      contentType: "audio/wav",
      buffer
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

async function presignUpload(accessToken, mediaFile) {
  const body = {
    fileName: mediaFile.fileName,
    contentType: mediaFile.contentType,
    sizeBytes: mediaFile.buffer.byteLength
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

async function uploadMedia(presignPayload, mediaFile) {
  const uploadResponse = await fetch(presignPayload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type":
        presignPayload.requiredHeaders?.["content-type"] ?? mediaFile.contentType
    },
    body: mediaFile.buffer
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
  const walletBeforeTopup = await getWallet(accessToken);
  const pixPayment = await createPixPayment(accessToken, 10);
  if (pixPayment?.pix?.providerMode === "mock") {
    await confirmPixPayment(accessToken, pixPayment.payment.id);
    const walletAfterTopup = await getWallet(accessToken);
    assert.ok(
      Number(walletAfterTopup.availableBalance) > Number(walletBeforeTopup.availableBalance),
      "wallet balance did not increase after PIX confirmation"
    );
    console.log("[smoke:e2e] Wallet balance increased after PIX top-up.");
  } else {
    console.log(
      "[smoke:e2e] PIX provider is mercado_pago. Automatic confirmation skipped in smoke."
    );
  }

  const mediaFile = await createValidSmokeMedia();
  const presignPayload = await presignUpload(accessToken, mediaFile);
  await uploadMedia(presignPayload, mediaFile);
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
