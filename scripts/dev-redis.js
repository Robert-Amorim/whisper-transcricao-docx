const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const host = process.env.REDIS_HOST || "127.0.0.1";
const port = Number(process.env.REDIS_PORT || 6380);
const redisBin = path.resolve(
  __dirname,
  "..",
  "tools",
  "redis-windows",
  "redis-server.exe"
);

function isPortOpen(hostname, portNumber) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(1200);
    socket.once("connect", () => finalize(true));
    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));
    socket.connect(portNumber, hostname);
  });
}

let child = null;
let idleTimer = null;

function attachShutdown() {
  const shutdown = () => {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(0), 100);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const inUse = await isPortOpen(host, port);
  if (inUse) {
    console.log(`[dev:redis] Reusing existing Redis at ${host}:${port}.`);
    attachShutdown();
    idleTimer = setInterval(() => {}, 60_000);
    return;
  }

  console.log(`[dev:redis] Starting portable Redis at ${host}:${port}...`);
  child = spawn(redisBin, ["--port", String(port), "--appendonly", "no"], {
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error("[dev:redis] Failed to start redis-server.exe:", error.message);
    process.exit(1);
  });

  attachShutdown();
}

main().catch((error) => {
  console.error("[dev:redis] Unexpected error:", error);
  process.exit(1);
});
