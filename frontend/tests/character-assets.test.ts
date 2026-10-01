import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("asset preflight fails missing files, unsafe paths and incomplete rigs; empty manifest is explicit", () => {
  const dir = mkdtempSync(join(tmpdir(), "agentcity-assets-test-"));
  const run = () => spawnSync(process.execPath, [resolve("scripts/check-characters.mjs"), dir], { encoding: "utf8" });
  const manifest = (residents: unknown) => writeFileSync(join(dir, "manifest.json"), JSON.stringify({residents}));
  try {
    manifest({});
    const empty = run();
    assert.equal(empty.status, 0);
    assert.match(empty.stdout, /0\/26 imported character models/);
    manifest({cit_009:{file:"missing.glb"}});
    assert.notEqual(run().status, 0);
    manifest({cit_009:{file:"../outside.glb"}});
    assert.match(run().stderr, /Invalid GLB filename/);
    manifest({cit_009:{file:"cit_009.glb"}});
    let json = JSON.stringify({asset:{version:"2.0"}, nodes:[], meshes:[]});
    json = json.padEnd(Math.ceil(json.length/4)*4," ");
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4);
    header.writeUInt32LE(20+Buffer.byteLength(json),8);
    header.writeUInt32LE(Buffer.byteLength(json),12); header.writeUInt32LE(0x4e4f534a,16);
    writeFileSync(join(dir,"cit_009.glb"),Buffer.concat([header,Buffer.from(json)]));
    assert.match(run().stderr, /missing bones/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("bundled CC0 residents have mobile-sized embedded textures, real skins and facial animation", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/check-characters.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const residents = Object.keys(JSON.parse(readFileSync(resolve("public/characters/manifest.json"), "utf8")).residents);
  const cast = (JSON.parse(readFileSync(resolve("src/lib/generated/citizens.json"), "utf8")) as Array<{ citizen_id: string }>).map((c) => c.citizen_id);
  assert.deepEqual([...residents].sort(), [...cast].sort(), "every resident has a real body, so nobody is left as a toy figure");
  for (const id of residents) {
    const bytes = readFileSync(resolve(`public/characters/${id}.glb`));
    assert.ok(bytes.length < 2 * 1024 * 1024, `${id} must stay below 2 MiB`);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
    assert.ok(gltf.skins?.length > 0);
    assert.ok(gltf.images?.length >= 4);
    assert.ok(gltf.extensionsUsed.includes("EXT_meshopt_compression"));
    for (const mat of gltf.materials) {
      assert.notEqual(mat.alphaMode, "BLEND", "No sorted translucent skin or clothing");
      assert.equal(mat.pbrMetallicRoughness.metallicFactor, 0);
    }
  }
});
