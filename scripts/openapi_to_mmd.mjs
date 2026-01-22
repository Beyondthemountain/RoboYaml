import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import yaml from "js-yaml";
import { generateDiagrams } from "openapi-mermaid";

const SRC_ROOT = "yaml_source";
const OUT_ROOT = "yaml_output/mmd";
const TMP_ROOT = ".tmp/openapi-json";

const OPENAPI_GLOB = `${SRC_ROOT}/**/*.y?(a)ml`;

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, "");
}

function safeSegment(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function main() {
  await ensureDir(OUT_ROOT);
  await ensureDir(TMP_ROOT);

  const files = await fg([OPENAPI_GLOB], { dot: false });
  if (!files.length) {
    console.log(`No OpenAPI YAML found under ${SRC_ROOT}/`);
    return;
  }

  for (const absLike of files) {
    // absLike is repo-relative from fast-glob
    const relFromSrc = path.relative(SRC_ROOT, absLike);      // e.g. teamB/core/api.yaml
    const relDir = path.dirname(relFromSrc);                  // e.g. teamB/core
    const baseName = stripExt(path.basename(relFromSrc));     // e.g. api

    // Per-spec output folder (this is what gives you “automatic subfolder structure”)
    const outDir = path.join(OUT_ROOT, relDir, baseName);     // yaml_output/mmd/teamB/core/api
    await ensureDir(outDir);

    // Temp JSON (keep it unique by mirroring structure)
    const tmpDir = path.join(TMP_ROOT, relDir);
    await ensureDir(tmpDir);
    const tmpJson = path.join(tmpDir, `${safeSegment(baseName)}.json`);

    const raw = await fs.readFile(absLike, "utf8");
    const obj = yaml.load(raw);
    await fs.writeFile(tmpJson, JSON.stringify(obj, null, 2), "utf8");

    // Important: we *don’t* assume how many .mmd files are generated.
    // Putting outputPath in a per-spec folder keeps outputs contained.
    await generateDiagrams({
      openApiJsonFileName: tmpJson,
      outputPath: outDir,
      // outputFileName is optional; leaving it undefined avoids forcing single-file assumptions
      // outputFileName: baseName
    });

    console.log(`Generated Mermaid for ${absLike} -> ${outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
