import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialCity } from "../src/lib/initial-city";
import { appearanceFor, styleFor } from "../src/lib/appearance";
import { characterPrompt } from "../src/lib/character-prompt";

test("all 26 active residents have Japanese identities and authored adult wardrobes", () => {
  const city = createInitialCity();
  assert.equal(city.citizens.length,26);
  assert.equal(new Set(city.citizens.map(c=>c.name)).size,26);
  for (const c of city.citizens) {
    assert.equal((c.personality.identity as {nationality:string}).nationality,"Japanese");
    assert.ok(c.age>=18);
    assert.ok(characterPrompt(c).includes("Japanese resident of Tokyo"));
    assert.match(appearanceFor(c).hair,/^#[0-9a-f]{6}$/i);
    assert.ok(styleFor(c).hairstyle);
    for (const id of c.life?.parent_ids ?? []) {
      if (id.startsWith("ext_")) continue; // Off-map family members are represented by stable external IDs.
      const parent=city.citizens.find(p=>p.citizen_id===id)!;
      assert.ok(parent);
      assert.ok(parent.age-c.age>=20);
    }
  }
  assert.ok(new Set(city.citizens.map(c=>styleFor(c).outfit)).size>=4);
});
