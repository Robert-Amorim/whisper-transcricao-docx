import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const CSS_FILE = path.join(ROOT_DIR, "apps", "web", "src", "styles", "globals.css");
const SOURCE_DIR = path.join(ROOT_DIR, "apps", "web", "src");
const REPORT_DIR = path.join(ROOT_DIR, "docs", "reports");
const REPORT_JSON = path.join(REPORT_DIR, "css-usage-report.json");
const REPORT_MD = path.join(REPORT_DIR, "css-usage-report.md");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function extractCssClasses(cssContent) {
  const regex = /(?:^|[^a-zA-Z0-9_-])\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const classes = new Set();
  let match;

  while ((match = regex.exec(cssContent)) !== null) {
    classes.add(match[1]);
  }

  return [...classes].sort();
}

function cleanClassToken(token) {
  return token
    .trim()
    .replace(/^[`"'{}()[\],.:;!?]+/, "")
    .replace(/[`"'{}()[\],.:;!?]+$/, "");
}

function extractClassEvidence(content) {
  const classTokens = new Set();
  const dynamicPrefixes = new Set();
  const attrRegex =
    /(className|class|containerClassName|itemBaseClassName)\s*=\s*\{?\s*(["'`])([\s\S]*?)\2\s*\}?/g;
  let match;

  while ((match = attrRegex.exec(content)) !== null) {
    const body = match[3];
    const normalized = body.replace(/\s+/g, " ");
    const parts = normalized.split(" ");

    for (const rawPart of parts) {
      if (!rawPart.trim()) {
        continue;
      }

      const dynamicMatch = rawPart.match(/([a-zA-Z_][a-zA-Z0-9_-]*-)\$\{/);
      if (dynamicMatch) {
        dynamicPrefixes.add(dynamicMatch[1]);
      }

      if (rawPart.includes("${")) {
        const prefix = cleanClassToken(rawPart.split("${")[0]);
        if (prefix.endsWith("-")) {
          dynamicPrefixes.add(prefix);
        } else if (prefix) {
          classTokens.add(prefix);
        }
        continue;
      }

      const cleaned = cleanClassToken(rawPart);
      if (cleaned) {
        classTokens.add(cleaned);
      }
    }

    const literalRegex = /["'`]([a-zA-Z_][a-zA-Z0-9_-]*)["'`]/g;
    let literalMatch;
    while ((literalMatch = literalRegex.exec(body)) !== null) {
      classTokens.add(literalMatch[1]);
    }
  }

  return {
    classTokens,
    dynamicPrefixes
  };
}

function findClassUsage(className, evidence) {
  return evidence.classTokens.has(className);
}

function findDynamicClassUsage(className, evidence) {
  for (const prefix of evidence.dynamicPrefixes) {
    if (className.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function createMarkdown(report) {
  const usedRows = report.usedClasses
    .map((item) => `| \`${item.className}\` | ${item.mode} | ${item.files.join("<br/>")} |`)
    .join("\n");

  const unusedRows = report.unusedClasses.map((name) => `- \`${name}\``).join("\n");

  return [
    "# CSS Usage Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- CSS file: \`${report.cssFile}\``,
    `- Source directory: \`${report.sourceDir}\``,
    "",
    "## Summary",
    "",
    `- Total CSS classes: **${report.summary.totalClasses}**`,
    `- Used classes: **${report.summary.usedClasses}**`,
    `- Unused classes: **${report.summary.unusedClasses}**`,
    "",
    "## Used Classes",
    "",
    "| Class | Match type | Files |",
    "|---|---|---|",
    usedRows || "| - | - | - |",
    "",
    "## Unused Classes",
    "",
    unusedRows || "- None"
  ].join("\n");
}

async function main() {
  const [cssContent, sourceFiles] = await Promise.all([
    fs.readFile(CSS_FILE, "utf8"),
    walkFiles(SOURCE_DIR)
  ]);

  const filteredSourceFiles = sourceFiles.filter(
    (filePath) => !filePath.endsWith(path.join("styles", "globals.css"))
  );
  const sourceContents = await Promise.all(
    filteredSourceFiles.map(async (filePath) => ({
      filePath,
      relPath: toPosixPath(path.relative(ROOT_DIR, filePath)),
      content: await fs.readFile(filePath, "utf8")
    }))
  );
  const sourceEvidence = sourceContents.map((sourceFile) => ({
    ...sourceFile,
    evidence: extractClassEvidence(sourceFile.content)
  }));

  const cssClasses = extractCssClasses(cssContent);
  const usedClasses = [];
  const unusedClasses = [];

  for (const className of cssClasses) {
    const matchedFiles = [];
    let mode = "static";

    for (const sourceFile of sourceEvidence) {
      if (findClassUsage(className, sourceFile.evidence)) {
        matchedFiles.push(sourceFile.relPath);
      }
    }

    if (matchedFiles.length === 0) {
      for (const sourceFile of sourceEvidence) {
        if (findDynamicClassUsage(className, sourceFile.evidence)) {
          matchedFiles.push(sourceFile.relPath);
        }
      }
      if (matchedFiles.length > 0) {
        mode = "dynamic";
      }
    }

    if (matchedFiles.length > 0) {
      usedClasses.push({
        className,
        mode,
        files: [...new Set(matchedFiles)].sort()
      });
      continue;
    }

    unusedClasses.push(className);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    cssFile: toPosixPath(path.relative(ROOT_DIR, CSS_FILE)),
    sourceDir: toPosixPath(path.relative(ROOT_DIR, SOURCE_DIR)),
    summary: {
      totalClasses: cssClasses.length,
      usedClasses: usedClasses.length,
      unusedClasses: unusedClasses.length
    },
    usedClasses: usedClasses.sort((a, b) => a.className.localeCompare(b.className)),
    unusedClasses: unusedClasses.sort((a, b) => a.localeCompare(b))
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(REPORT_MD, `${createMarkdown(report)}\n`, "utf8")
  ]);

  console.log(`Report generated: ${toPosixPath(path.relative(ROOT_DIR, REPORT_JSON))}`);
  console.log(`Report generated: ${toPosixPath(path.relative(ROOT_DIR, REPORT_MD))}`);
  console.log(
    `Summary: total=${report.summary.totalClasses}, used=${report.summary.usedClasses}, unused=${report.summary.unusedClasses}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
