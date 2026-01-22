import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { spawn } from "node:child_process";

const IN_ROOT = "yaml_output/mmd";
const OUT_ROOT = "yaml_output/svg";
const PUPPETEER_CFG = "scripts/puppeteer.config.json";

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  await ensureDir(OUT_ROOT);

  const mmdFiles = await fg([`${IN_ROOT}/**/*.mmd`], { dot: false });
  if (!mmdFiles.length) {
    console.log(`No .mmd files found under ${IN_ROOT}/`);
    return;
  }

  for (const mmdPath of mmdFiles) {
    const rel = path.relative(IN_ROOT, mmdPath); // e.g. teamB/core/api/diagram1.mmd
    const outDir = path.join(OUT_ROOT, path.dirname(rel));
    await ensureDir(outDir);

    const base = path.basename(mmdPath, ".mmd");
    const outSvg = path.join(outDir, `${base}.svg`);

    await run("npx", [
      "--yes",
      "mmdc",
      "-i",
      mmdPath,
      "-o",
      outSvg,
      "--puppeteerConfigFile",
      PUPPETEER_CFG
    ]);

    console.log(`Rendered: ${outSvg}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
