import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

  // Snapshot existing diagram-like files before generation
  const before = new Set(listDiagramFiles(outMmdDir));

  // Generate diagram from LOCAL file (no http/file://)
  await generateDiagrams({
    openApiJsonFileName: specPath,
    outputPath: outMmdDir,
    // outputFileName is optional; we will normalise the output name ourselves
  });

  // Identify what file was produced
  const after = listDiagramFiles(outMmdDir).filter((p) => !before.has(p));
  let produced = after.length === 1 ? after[0] : newestFile(after);

  // Fallback: sometimes the tool overwrites an existing file name
  if (!produced) produced = newestFile(listDiagramFiles(outMmdDir));

  if (!produced) {
    die(`No diagram file produced for ${rel} (expected .mmd or .md in ${outMmdDir})`);
  }

  // Normalise to a deterministic .mmd filename
  const normalisedMmd = path.join(outMmdDir, `${baseName}.mmd`);
  if (path.resolve(produced) !== path.resolve(normalisedMmd)) {
    // Overwrite if exists (keeps updates consistent)
    try { fs.unlinkSync(normalisedMmd); } catch {}
    fs.renameSync(produced, normalisedMmd);
  }

  console.log(`MMD: ${path.posix.join("yaml_output/mmd", relDir === "." ? "" : relDir, `${baseName}.mmd`)}`);

  // Render SVG next to it (mirroring folder structure)
  const svgPath = path.join(outSvgDir, `${baseName}.svg`);

  const r = spawnSync(
    "npx",
    ["-y", "@mermaid-js/mermaid-cli", "-i", normalisedMmd, "-o", svgPath],
    { stdio: "inherit" }
  );
  if (r.status !== 0) die(`Mermaid CLI failed for ${normalisedMmd}`);

  console.log(`SVG: ${path.posix.join("yaml_output/svg", relDir === "." ? "" : relDir, `${baseName}.svg`)}`);
}

console.log("Done.");
