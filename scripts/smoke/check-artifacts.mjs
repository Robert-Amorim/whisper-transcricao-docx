import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const requiredFiles = [
  "packages/shared/dist/index.js",
  "apps/api/dist/index.js",
  "apps/worker/dist/index.js",
  "apps/web/dist/index.html"
];

let hasError = false;

async function requireFile(path) {
  const absolutePath = resolve(path);
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile() || fileStat.size === 0) {
      console.error(`[smoke:artifacts] Invalid file: ${path}`);
      hasError = true;
      return;
    }
    console.log(`[smoke:artifacts] OK file: ${path}`);
  } catch {
    console.error(`[smoke:artifacts] Missing file: ${path}`);
    hasError = true;
  }
}

async function checkWebAssets() {
  const assetsPath = resolve("apps/web/dist/assets");
  try {
    const entries = await readdir(assetsPath);
    const hasJs = entries.some((entry) => entry.endsWith(".js"));
    const hasCss = entries.some((entry) => entry.endsWith(".css"));

    if (!hasJs || !hasCss) {
      console.error("[smoke:artifacts] Missing JS or CSS assets in apps/web/dist/assets.");
      hasError = true;
      return;
    }
    console.log("[smoke:artifacts] OK web assets (js + css).");
  } catch {
    console.error("[smoke:artifacts] Missing apps/web/dist/assets directory.");
    hasError = true;
  }
}

async function checkWebEntry() {
  const indexPath = resolve("apps/web/dist/index.html");
  try {
    const html = await readFile(indexPath, "utf8");
    if (!html.includes('id="root"')) {
      console.error('[smoke:artifacts] apps/web/dist/index.html missing root mount node.');
      hasError = true;
      return;
    }
    console.log("[smoke:artifacts] OK web root mount node.");
  } catch {
    console.error("[smoke:artifacts] Could not read apps/web/dist/index.html.");
    hasError = true;
  }
}

for (const filePath of requiredFiles) {
  await requireFile(filePath);
}

await checkWebAssets();
await checkWebEntry();

if (hasError) {
  process.exit(1);
}

console.log("[smoke:artifacts] All checks passed.");
