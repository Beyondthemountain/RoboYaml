import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import openapiMermaid from "openapi-mermaid";
const { generateDiagrams } = openapiMermaid;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sourceDir = path.join(repoRoot, "yaml_source");
const mmdRoot = path.join(repoRoot, "yaml_output", "mmd");
const svgRoot = path.join(repoRoot, "yaml_output", "svg");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function findSpecs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSpecs(full));
    else if (/\.(ya?ml|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function listDiagramFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(dir, e.name))
    .filter((p) => /\.(mmd|md)$/i.test(p));
}

function newestFile(paths) {
  if (paths.length === 0) return null;
  return paths
    .map((p) => ({ p, t: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].p;
}

function toTempJsonIfNeeded(specPath) {
  const ext = path.extname(specPath).toLowerCase();
  if (ext === ".json") return { inputPath: specPath, tempPath: null };

  // YAML -> JSON temp file
  const raw = fs.readFileSync(specPath, "utf8");
  const doc = yaml.load(raw);

  const h = crypto.createHash("sha256").update(specPath).digest("hex").slice(0, 16);
  const tempPath = path.join(os.tmpdir(), `openapi-${h}.json`);

  fs.writeFileSync(tempPath, JSON.stringify(doc), "utf8");
  return { inputPath: tempPath, tempPath };
}

if (!fs.existsSync(sourceDir)) die(`Missing source directory: ${sourceDir}`);

const specs = findSpecs(sourceDir);
if (specs.length === 0) die("No specs found under yaml_source/");

ensureDir(mmdRoot);
ensureDir(svgRoot);

for (const specPath of specs) {
  const rel = path.relative(sourceDir, specPath).replace(/\\/g, "/");
  const relDir = path.posix.dirname(rel); // '.' if at root
  const baseName = path.posix.basename(rel).replace(/\.(ya?ml|json)$/i, "");

  // Preserve subfolders to avoid collisions
  const outMmdDir = relDir === "." ? mmdRoot : path.join(mmdRoot, relDir);
  const outSvgDir = relDir === "." ? svgRoot : path.join(svgRoot, relDir);
  ensureDir(outMmdDir);
  ensureDir(outSvgDir);

  // Snapshot diagram-like files before generation
  const before = new Set(listDiagramFiles(outMmdDir));

  // Ensure openapi-mermaid gets JSON
  const { inputPath, tempPath } = toTempJsonIfNeeded(specPath);

  try {
    await generateDiagrams({
      openApiJsonFileName: inputPath,
      outputPath: outMmdDir
    });
  } finally {
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  // Identify produced output (openapi-mermaid may write .md or .mmd with varying names)
  const after = listDiagramFiles(outMmdDir).filter((p) => !before.has(p));
  let produced = after.length === 1 ? after[0] : newestFile(after);
  if (!produced) produced = newestFile(listDiagramFiles(outMmdDir));

  if (!produced) {
    die(`No diagram file produced for ${rel} (expected .mmd or .md in ${outMmdDir})`);
  }

  // Normalise to deterministic .mmd filename
  const normalisedMmd = path.join(outMmdDir, `${baseName}.mmd`);
  if (path.resolve(produced) !== path.resolve(normalisedMmd)) {
    try { fs.unlinkSync(normalisedMmd); } catch {}
    fs.renameSync(produced, normalisedMmd);
  }

  console.log(
    `MMD: ${path.posix.join(
      "yaml_output/mmd",
      relDir === "." ? "" : relDir,
      `${baseName}.mmd`
    )}`
  );

  // Render SVG (mirrors folder structure)
  const svgPath = path.join(outSvgDir, `${baseName}.svg`);
  const r = spawnSync(
    "npx",
    ["-y", "@mermaid-js/mermaid-cli", "-i", normalisedMmd, "-o", svgPath],
    { stdio: "inherit" }
  );
  if (r.status !== 0) die(`Mermaid CLI failed for ${normalisedMmd}`);

  console.log(
    `SVG: ${path.posix.join(
      "yaml_output/svg",
      relDir === "." ? "" : relDir,
      `${baseName}.svg`
    )}`
  );
}

console.log("Done.");
