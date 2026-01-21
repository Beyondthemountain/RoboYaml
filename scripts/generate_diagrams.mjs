// scripts/generate_diagrams.mjs
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
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

function findSpecs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSpecs(full));
    else if (/\.(ya?ml|json)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(sourceDir)) die(`Missing source directory: ${sourceDir}`);

const specs = findSpecs(sourceDir);
if (specs.length === 0) die("No specs found under yaml_source/");

ensureDir(mmdRoot);
ensureDir(svgRoot);

// Serve yaml_source over HTTP because openapi-mermaid expects http/https URLs
const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (!reqPath.startsWith("/yaml_source/")) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const rel = reqPath.slice("/yaml_source/".length);
  const filePath = path.join(sourceDir, rel);
  const normalised = path.normalize(filePath);

  // prevent path traversal
  if (!normalised.startsWith(sourceDir)) {
    res.writeHead(400);
    return res.end("Bad request");
  }

  if (!fs.existsSync(normalised) || fs.statSync(normalised).isDirectory()) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const ext = path.extname(normalised).toLowerCase();
  const contentType =
    ext === ".json"
      ? "application/json"
      : ext === ".yaml" || ext === ".yml"
      ? "application/yaml"
      : "text/plain";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(normalised).pipe(res);
});

server.listen(0, "127.0.0.1", async () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : null;
  if (!port) die("Failed to start local server");

  const baseUrl = `http://127.0.0.1:${port}`;

  // Track exactly what we generate (avoids any filesystem scan issues)
  const generatedMmdFiles = [];

  try {
    // 1) Generate one .mmd per spec (preserve subfolders; prevents collisions)
    for (const specPath of specs) {
      const rel = path.relative(sourceDir, specPath).replace(/\\/g, "/");
      const relDir = path.posix.dirname(rel); // '.' for root
      const baseName = path.posix.basename(rel).replace(/\.(ya?ml|json)$/i, "");

      const outMmdDir = relDir === "." ? mmdRoot : path.join(mmdRoot, relDir);
      ensureDir(outMmdDir);

      await generateDiagrams({
        openApiJsonUrl: `${baseUrl}/yaml_source/${rel}`,
        outputPath: outMmdDir,
        outputFileName: baseName,
      });

      const produced = path.join(outMmdDir, `${baseName}.mmd`);
      generatedMmdFiles.push(produced);

      console.log(
        `MMD: ${path.posix.join(
          "yaml_output/mmd",
          relDir === "." ? "" : relDir,
          `${baseName}.mmd`
        )}`
      );
    }

    // 2) Render SVG for each generated .mmd (preserve subfolders)
    if (generatedMmdFiles.length === 0) die("No .mmd files recorded (unexpected)");

    for (const mmdPath of generatedMmdFiles) {
      if (!fs.existsSync(mmdPath)) {
        die(`Expected .mmd missing on disk: ${mmdPath}`);
      }

      const rel = path.relative(mmdRoot, mmdPath).replace(/\\/g, "/");
      const svgPath = path.join(svgRoot, rel.replace(/\.mmd$/i, ".svg"));
      ensureDir(path.dirname(svgPath));

      const r = spawnSync(
        "npx",
        ["-y", "@mermaid-js/mermaid-cli", "-i", mmdPath, "-o", svgPath],
        { stdio: "inherit" }
      );

      if (r.status !== 0) die(`Mermaid CLI failed for ${mmdPath}`);

      console.log(
        `SVG: ${path.posix.join(
          "yaml_output/svg",
          rel.replace(/\.mmd$/i, ".svg")
        )}`
      );
    }

    console.log("Done.");
  } catch (e) {
    console.error(e?.stack || e);
    process.exit(1);
  } finally {
    server.close();
  }
});
