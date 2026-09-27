import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { FrameMonitor, initialQuality, lowerQuality, presets } from "../src/game/three/quality";

const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
  location: { search: "" },
  innerWidth: 1440,
  matchMedia: () => ({ matches: false }),
});
beforeEach(() => { storage.clear(); (globalThis as { location: { search: string } }).location.search = ""; });

test("each preset is lighter than the one above it", () => {
  assert.ok(presets.high.pixelRatio > presets.medium.pixelRatio && presets.medium.pixelRatio > presets.low.pixelRatio);
  assert.ok(presets.high.msaa > presets.medium.msaa && presets.medium.msaa > presets.low.msaa);
  assert.equal(presets.low.ao, false, "weak devices skip ambient occlusion");
});

test("the URL wins, then what this device settled on, then a guess", () => {
  (globalThis as { location: { search: string } }).location.search = "?q=low";
  assert.equal(initialQuality().level, "low");
  (globalThis as { location: { search: string } }).location.search = "?q=med";
  assert.equal(initialQuality().level, "medium");
  (globalThis as { location: { search: string } }).location.search = "";
  storage.set("agentcity.quality", "medium");
  assert.equal(initialQuality().level, "medium");
});

test("stepping down is remembered and stops at low", () => {
  assert.equal(lowerQuality("high")?.level, "medium");
  assert.equal(storage.get("agentcity.quality"), "medium");
  assert.equal(lowerQuality("low"), null);
});

test("sustained slow frames ask for a lower preset; a short hitch does not", () => {
  let slow = 0;
  const monitor = new FrameMonitor(() => slow++, 45, 5000);
  let now = 0;
  monitor.sample(now, 33);
  for (now = 4000; now <= 9500; now += 33) monitor.sample(now, now < 4400 ? 200 : 33);
  assert.equal(slow, 0, "a hitch right after loading is ignored");
  for (; now <= 16000; now += 60) monitor.sample(now, 60);
  assert.equal(slow, 1);
});
