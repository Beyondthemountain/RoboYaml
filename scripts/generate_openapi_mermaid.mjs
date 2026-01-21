import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDiagrams } from "openapi-mermaid";

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

for (const spec of specs) {
  const rel = path.relative(sourceDir, spec);
  const base = rel.replace(/[\\/]/g, "__").replace(/\.(ya?ml|json)$/i, "");
  const fileUrl = new URL(`file://${spec}`).toString();

  await generateDiagrams({
    openApiJsonUrl: fileUrl,
    outputPath: mmdOutDir,
    outputFileName: base,
  });

  console.log(`Generated MMD for ${rel}`);
}

console.log("Mermaid generation complete.");
