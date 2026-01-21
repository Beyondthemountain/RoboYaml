import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

import openapiMermaid from "openapi-mermaid";
const { generateDiagrams } = openapiMermaid;

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

if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const specs = findSpecs(sourceDir);
if (specs.length === 0) {
  console.error("No OpenAPI files found in yaml_source/");
  process.exit(1);
}

fs.mkdirSync(mmdOutDir, { recursive: true });

// Tiny server to serve yaml_source/ over HTTP for generateDiagrams()
const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent((req.url || "/").split("?")[0]);

  // Only serve under /yaml_source/...
  if (!reqPath.startsWith("/yaml_source/")) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const rel = reqPath.replace("/yaml_source/", "");
  const filePath = path.join(sourceDir, rel);

  // Prevent path traversal
  const normalised = path.normalize(filePath);
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
    ext === ".json" ? "application/json" :
    (ext === ".yaml" || ext === ".yml") ? "application/yaml" :
    "text/plain";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(normalised).pipe(res);
});

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    for (const specPath of specs) {
      const rel = path.relative(sourceDir, specPath).replace(/\\/g, "/");
      const baseName = rel.replace(/\.(ya?ml|json)$/i, "").replace(/\//g, "__");

      await generateDiagrams({
        openApiJsonUrl: `${baseUrl}/yaml_source/${rel}`,
        outputPath: mmdOutDir,
        outputFileName: baseName
      });

      console.log(`Generated MMD for ${rel}`);
    }
  } finally {
    server.close();
  }
});
