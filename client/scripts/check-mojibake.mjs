import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const ALLOWED_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".md"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);
const EXTRA_FILES = [
  path.resolve(process.cwd(), "README.md"),
  path.resolve(process.cwd(), "../README.md"),
];

// Common mojibake fragments from UTF-8/CP1251/CP1252 mixups.
const BAD_PATTERN = /(?:\uFFFD|вЂ|вњ|в–|Ã.)/g;

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!ALLOWED_EXT.has(path.extname(entry.name))) continue;
    out.push(full);
  }
  return out;
}

function collectFindings(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, idx) => {
    BAD_PATTERN.lastIndex = 0;
    if (!BAD_PATTERN.test(line)) return;
    findings.push({
      line: idx + 1,
      sample: line.trim().slice(0, 180),
    });
  });
  return findings;
}

if (!fs.existsSync(ROOT)) {
  console.error("check-mojibake: src directory not found");
  process.exit(2);
}

const files = walk(ROOT);
for (const filePath of EXTRA_FILES) {
  if (fs.existsSync(filePath)) files.push(filePath);
}
const all = [];
for (const filePath of files) {
  const findings = collectFindings(filePath);
  if (!findings.length) continue;
  all.push({ filePath, findings });
}

if (!all.length) {
  console.log("check-mojibake: OK");
  process.exit(0);
}

console.error("check-mojibake: found suspicious text fragments");
for (const item of all) {
  const rel = path.relative(process.cwd(), item.filePath);
  for (const finding of item.findings) {
    console.error(`${rel}:${finding.line}: ${finding.sample}`);
  }
}
process.exit(1);
