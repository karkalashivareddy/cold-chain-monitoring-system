import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2];
if (!reportPath) throw new Error("Usage: node scripts/check-audit.mjs <npm-audit-json>");

const raw = fs.readFileSync(reportPath);
const text = raw[0] === 0xff && raw[1] === 0xfe
  ? raw.toString("utf16le").slice(1)
  : raw.toString("utf8").replace(/^\uFEFF/, "");
const report = JSON.parse(text);
if (report.error || !report.vulnerabilities) {
  throw new Error(`npm audit did not return a complete report: ${report.error?.summary ?? "missing vulnerabilities data"}`);
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const blocking = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;

  const nodes = vulnerability.nodes ?? [];
  const toolingOnly = nodes.length > 0 && nodes.every((nodePath) => {
    const normalized = path.posix.normalize(nodePath.replaceAll("\\", "/")).replace(/^\.?\//, "");
    const entry = lock.packages?.[normalized];
    return entry?.dev === true || entry?.devOptional === true;
  });

  if (toolingOnly) {
    console.warn(`High-severity advisory resolves only to lockfile entries marked dev/devOptional: ${name}. Review the separate --omit=dev audit before classifying runtime exposure.`);
  } else {
    blocking.push(`${name} (${vulnerability.severity})`);
  }
}

if (blocking.length > 0) {
  throw new Error(`High/critical runtime dependency advisories: ${blocking.join(", ")}`);
}
console.log("No high/critical advisories resolve to non-dev lockfile entries. Any devOptional findings remain reported above and require separate production-omission review.");
