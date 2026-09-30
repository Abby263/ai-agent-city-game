import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, minutesBehindRealTime, saveSessionCity, seedSession, sessionSyncToRealTime } from "../src/lib/session-simulation";
import { realCityTime } from "../src/lib/calendar";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});

test("real Tokyo time maps onto city days", () => {
  // 26 Oct 2026 is day 1; 14:07 in Tokyo on 31 Oct is 05:07 UTC.
  assert.deepEqual(realCityTime("2026-10-26", new Date("2026-10-31T05:07:00Z")), { day: 6, minute: 847, second: 0 });
});

test("a live world catches up with real time, living through the missed days", async () => {
  seedSession(createInitialCity());
  const city = getSessionCity()!;
  city.policy.time_mode = "live";
  saveSessionCity(city);
  const now = new Date("2026-10-31T05:07:00Z");
  assert.ok(minutesBehindRealTime(city, now) > 5 * 1440);
  const synced = await sessionSyncToRealTime(now);
  assert.equal(synced.clock.day, 6);
  assert.equal(synced.clock.minute_of_day, 840);
  assert.ok(synced.citizens.find((c) => c.name.startsWith("Kaito"))!.age === 21, "Kaito's birthday on day 3 happened while away");
  assert.ok(synced.life_log?.some((e) => e.kind === "time_skip"));
  assert.ok(synced.weather, "weather is current");
  assert.ok(Math.abs(minutesBehindRealTime(synced, now)) < 15);
});

test("fast-mode worlds are never pulled back to real time", async () => {
  storage.clear();
  seedSession(createInitialCity());
  const before = getSessionCity()!;
  const after = await sessionSyncToRealTime(new Date("2026-11-30T05:00:00Z"));
  assert.equal(after.clock.day, before.clock.day);
});
