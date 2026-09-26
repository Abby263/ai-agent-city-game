import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, saveSessionCity, seedSession, sessionSetMode, sessionTick } from "../src/lib/session-simulation";
import type { DecideSocial } from "../src/lib/encounters";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } },
  configurable: true,
});
// Residents keep to themselves so the test exercises routines without any AI conversation.
const quiet: DecideSocial = async () => ({ target_id: null, reason: "I want to focus on my own plans.", topic: "" });
const noConversation = async () => { throw new Error("No conversation expected."); };

beforeEach(() => {
  storage.clear();
  seedSession(createInitialCity());
});

async function runUntil(day: number, fromMinute: number, toMinute: number) {
  const city = getSessionCity()!;
  city.clock.day = day;
  city.clock.minute_of_day = fromMinute;
  saveSessionCity(city);
  await sessionSetMode("autonomous");
  while (getSessionCity()!.clock.minute_of_day < toMinute) await sessionTick(noConversation, undefined, quiet);
  return getSessionCity()!;
}

test("on a Monday morning every student heads to school", async () => {
  const city = await runUntil(1, 360, 600);
  const students = city.citizens.filter((c) => c.profession === "Student");
  assert.ok(students.every((c) => c.current_activity === "Attend school"), students.map((c) => c.current_activity).join(", "));
  // Parents go to their own jobs.
  const priya = city.citizens.find((c) => c.name === "Priya Singh")!;
  assert.equal(priya.current_activity, "Working as doctor");
  assert.ok(city.citizens.every((c) => c.current_activity !== "Buying food"), city.citizens.map((c) => `${c.name}:${c.current_activity}:${Math.round(c.hunger)}:${c.x},${c.y}`).join(" | "));
});

test("on Saturday nobody goes to school and hobbies take over", async () => {
  const city = await runUntil(6, 360, 600);
  assert.ok(city.citizens.every((c) => c.current_activity !== "Attend school"));
  const ava = city.citizens.find((c) => c.citizen_id === "cit_009")!;
  assert.equal(ava.current_activity, "Building experiments at the Meguro Science Lab");
  const places = new Set(city.citizens.map((c) => c.current_activity));
  assert.ok(places.size >= 3, "weekend activities should differ between residents");
  assert.ok(!city.events.some((e) => e.event_type === "school_day_started"));
});

test("a new week: parents pay bills and hand out pocket money", async () => {
  const city = getSessionCity()!;
  city.clock.day = 7;
  city.clock.minute_of_day = 1425;
  saveSessionCity(city);
  await sessionSetMode("autonomous");
  const before = new Map(getSessionCity()!.citizens.map((c) => [c.citizen_id, c.money]));
  const next = await sessionTick(noConversation, undefined, quiet);
  assert.equal(next.clock.day, 8);
  const ava = next.citizens.find((c) => c.citizen_id === "cit_009")!;
  const priya = next.citizens.find((c) => c.citizen_id === "cit_033")!;
  assert.equal(ava.money, before.get("cit_009")! + 15);
  assert.ok(priya.money < before.get("cit_033")! - 15, "the household bill and allowance come out of the parent's money");
  assert.ok(next.life_log?.some((entry) => entry.kind === "payday") === false, "routine bills stay out of the newspaper");
  assert.equal(next.events.filter((e) => e.event_type === "life_payday").length, 1);
});
