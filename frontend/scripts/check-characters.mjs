import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const directory = process.argv[2] ?? fileURLToPath(new URL("../public/characters/", import.meta.url));
const roster = JSON.parse(readFileSync(new URL("../src/lib/generated/citizens.json", import.meta.url), "utf8"));
const ids = new Set(roster.map(c => c.citizen_id));
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
if (!manifest.residents || typeof manifest.residents !== "object" || Array.isArray(manifest.residents)) throw new Error("Manifest must have a residents object.");
const required = ["pelvis", "spine_03", "neck_01", "head", "thigh_l", "thigh_r", "calf_l", "calf_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"];
let count = 0;
for (const [id, entry] of Object.entries(manifest.residents)) {
  if (!ids.has(id)) throw new Error(`Unknown active resident: ${id}`);
  if (!entry || typeof entry.file !== "string" || !/^[a-zA-Z0-9_-]+\.glb$/.test(entry.file)) throw new Error(`Invalid GLB filename for ${id}`);
  if (entry.facingDegrees !== undefined && (!Number.isFinite(entry.facingDegrees) || Math.abs(entry.facingDegrees) > 360)) throw new Error(`Invalid facingDegrees for ${id}`);
  const bytes = readFileSync(resolve(directory, entry.file));
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`Invalid GLB v2: ${entry.file}`);
  const length = bytes.readUInt32LE(12);
  if (20 + length > bytes.length) throw new Error(`Truncated GLB: ${entry.file}`);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8").trim());
  if ((gltf.extensionsUsed ?? []).includes("KHR_draco_mesh_compression")) throw new Error(`${id}: Draco is unsupported; export with Meshopt.`);
  if ([...(gltf.images ?? []), ...(gltf.buffers ?? [])].some(item => item.uri && !item.uri.startsWith("data:"))) throw new Error(`${id}: embed all textures and buffers in the GLB.`);
  const names = new Set((gltf.nodes ?? []).map(n => n.name?.toLowerCase()));
  const missing = required.filter(n => !names.has(n));
  if (missing.length) throw new Error(`${id}: missing bones: ${missing.join(", ")}`);
  const shapes = new Set((gltf.meshes ?? []).flatMap(m => m.extras?.targetNames ?? []));
  for (const name of ["jawOpen", "eyeBlinkLeft", "eyeBlinkRight"]) if (!shapes.has(name)) throw new Error(`${id}: missing face shape ${name}`);
  if (bytes.length > 8 * 1024 * 1024) console.warn(`${id}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB exceeds the 8 MB mobile target.`);
  count++;
}
console.log(`Characters: ${count}/${ids.size} imported character models. ${ids.size - count} use procedural fallback bodies.`);
