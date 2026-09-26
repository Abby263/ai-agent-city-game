import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A code-only release directory prevents unrelated work and local runtime data from uploading.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stage = mkdtempSync(join(tmpdir(), "agentcity-release-"));
const files = [];
function copy(path) {
  const source = join(root, path);
  if (!lstatSync(source).isFile()) throw new Error(`Not a regular file: ${path}`);
  const target = join(stage, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  files.push(path);
}
function tree(path, extensions) {
  for (const item of readdirSync(join(root, path), { withFileTypes: true })) {
    if (item.name.startsWith(".") || item.name === "__pycache__") continue;
    const child = join(path, item.name);
    if (item.isSymbolicLink()) throw new Error(`Refusing symlink: ${child}`);
    if (item.isDirectory()) tree(child, extensions);
    else if (extensions.includes(extname(child))) copy(child);
  }
}
for (const path of [
  "vercel.json", ".vercelignore", ".vercel/project.json", "LICENSE", "README.md",
  "backend/main.py", "backend/requirements.txt", "backend/pyproject.toml",
  "frontend/package.json", "frontend/package-lock.json", "frontend/tsconfig.json",
  "frontend/next.config.ts", "frontend/next-env.d.ts", "frontend/postcss.config.mjs",
  "frontend/scripts/generate-citizens.mjs",
]) copy(path);
tree("backend/app", [".py", ".yaml"]);
tree("frontend/src", [".ts", ".tsx", ".css"]);
// The generated roster is rebuilt from source YAML, never copied from a running world's state.
tree("frontend/public", [".png", ".svg", ".webp", ".jpg", ".glb", ".gltf", ".md"]);
const forbidden = /(^|\/)(\.env[^/]*|productions|exports|snapshots|__pycache__)(\/|$)|\.(db|sqlite|log)$/;
if (files.some((path) => forbidden.test(path))) throw new Error("Runtime data in release manifest.");
for (const path of files.filter((path) => [".ts", ".tsx", ".py", ".yaml", ".json"].includes(extname(path)))) {
  const content = readFileSync(join(stage, path), "utf8");
  if (/sk-proj-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9_-]{30,}/.test(content))
    throw new Error(`Possible credential in release source: ${path}`);
}
console.log(JSON.stringify({ directory: stage, files: files.sort(), count: files.length }, null, 2));
