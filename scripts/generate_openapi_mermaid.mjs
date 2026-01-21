import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createMermaidGraph } from "openapi-mermaid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "yaml_source");
const mmdOutDir = path.join(repoRoot, "yaml_output", "mmd");

function findSpecs(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findSpecs(full));
    else if (/\.(ya?ml|json)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

fs.mkdirSync(mmdOutDir, { recursive: true });

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const specs = findSpecs(sourceDir);
if (specs.length === 0) {
  console.error("No OpenAPI files found in yaml_source/");
  process.exit(1);
}

for (const specPath of specs) {
  const rel = path.relative(sourceDir, specPath);
  const base = rel.replace(/[\\/]/g, "__").replace(/\.(ya?ml|json)$/i, "");

  const raw = fs.readFileSync(specPath, "utf8");
  const doc = specPath.toLowerCase().endsWith(".json") ? JSON.parse(raw) : yaml.load(raw);

  const mmd = createMermaidGraph(doc);
  const outPath = path.join(mmdOutDir, `${base}.mmd`);
  fs.writeFileSync(outPath, mmd, "utf8");

  console.log(`Wrote ${outPath}`);
}

console.log("Done.");
