import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { hobbyStop, isNewWeek, isWeekend, routineOffset, routineStop, weekday } from "../src/lib/routine";

const city = createInitialCity();
const byName = (name: string) => city.citizens.find((c) => c.name.startsWith(name))!;

test("day 1 is a Monday and days 6-7 are the weekend", () => {
  assert.equal(weekday(1), "Monday");
  assert.equal(weekday(6), "Saturday");
  assert.equal(weekday(8), "Monday");
  assert.deepEqual([1, 5, 6, 7, 8].map(isWeekend), [false, false, true, true, false]);
  assert.equal(isNewWeek(8), true);
  assert.equal(isNewWeek(1), false);
});

test("residents do not all move in lockstep", () => {
  const offsets = new Set(city.citizens.map((c) => routineOffset(c.citizen_id)));
  assert.ok(offsets.size > 1);
  for (const offset of offsets) assert.ok([-15, 0, 15].includes(offset));
});

test("hobbies follow each resident's skills", () => {
  assert.equal(hobbyStop(byName("Ava")).location_id, "loc_lab");
  assert.equal(hobbyStop(byName("Eliot")).location_id, "loc_farm");
  assert.equal(hobbyStop({ skills: [] }).location_id, "loc_park");
});

test("young adults go to their own jobs and keep hobbies on days off", () => {
  const ava = byName("Ava");
  assert.equal(routineStop(ava, 1, 600).activity, "Working as lab assistant");
  const saturday = routineStop(ava, 6, 600);
  assert.notEqual(saturday.location_id, "loc_school");
  assert.equal(saturday.location_id, "loc_lab");
  assert.equal(routineStop(ava, 6, 750).location_id, "loc_restaurant");
});

test("hobbies fit around shifts instead of replacing work", () => {
  const eliot = byName("Eliot");
  assert.equal(routineStop(eliot, 1, 960).location_id, "loc_mall");
  assert.equal(routineStop(eliot, 2, 960).location_id, "loc_farm");
  const ava = byName("Ava");
  assert.equal(routineStop(ava, 1, 1125).activity, hobbyStop(ava).activity);
  const sakura = byName("Sakura");
  assert.equal(hobbyStop(sakura).location_id, "loc_restaurant");
  assert.match(routineStop(sakura, 2, 660).activity, /Piano practice/);
  assert.match(routineStop(sakura, 1, 1300).activity, /Piano practice/);
});

test("nameplate icons describe what residents are doing", async () => {
  const { activityIcon } = await import("../src/lib/activity-icon");
  assert.equal(activityIcon("Sleeping in"), "💤");
  assert.equal(activityIcon("Attend school"), "📚");
  assert.equal(activityIcon("Going to talk with Noah"), "💬");
  assert.equal(activityIcon("Walking to Library"), "🚶");
  assert.equal(activityIcon("Helping in the Sunny Side Cafe kitchen"), "🍳");
  assert.equal(activityIcon("Something new"), "✨");
});
