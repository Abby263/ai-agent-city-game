import assert from "node:assert/strict";
import test from "node:test";
import { calendarDay, calendarStartFor, holidayOn } from "../src/lib/calendar";
import { conditionFromWmo, dayWeather, temperatureAt, weatherAt } from "../src/lib/weather";
import { routineStop } from "../src/lib/routine";
import type { LifeNews } from "../src/lib/life";
import { createInitialCity } from "../src/lib/initial-city";

test("the calendar follows Japan, with day 1 on a Monday", () => {
  const start = calendarStartFor(1, new Date("2026-09-26T03:00:00Z"));
  assert.equal(start, "2026-09-21");
  assert.equal(calendarDay(start, 6).date.toISOString().slice(0, 10), "2026-09-26");
  assert.equal(holidayOn(new Date("2026-09-21T00:00:00Z")), "Respect for the Aged Day");
  assert.equal(holidayOn(new Date("2026-05-05T00:00:00Z")), "Children's Day");
  assert.equal(calendarDay("2026-07-27", 1).schoolBreak, "Summer break");
  assert.equal(calendarDay("2026-01-05", 1).season, "winter");
});

test("the climate looks like Tokyo across a year", () => {
  let rain = 0, snow = 0;
  for (let d = 1; d <= 365; d++) {
    const w = dayWeather("2026-01-05", d);
    if (["rain", "heavy_rain", "typhoon"].includes(w.condition)) rain++;
    if (w.condition === "snow") snow++;
  }
  assert.ok(rain > 80 && rain < 150, `rain days ${rain}`);
  assert.ok(snow < 15);
  const august = weatherAt("2026-08-03", 1, 840).temp_c, january = weatherAt("2026-01-05", 1, 840).temp_c;
  assert.ok(august > january + 12, `${august} vs ${january}`);
  assert.ok(temperatureAt(30, 20, 5 * 60) < temperatureAt(30, 20, 14.5 * 60));
});

test("player weather overrides and real Tokyo codes map to conditions", () => {
  const w = weatherAt("2026-10-26", 1, 600, { condition: "typhoon", day: 1, from: 540, until: 900 });
  assert.equal(w.condition, "typhoon");
  assert.equal(w.alert?.kind, "typhoon");
  assert.equal(weatherAt("2026-10-26", 1, 600, { condition: "earthquake", day: 1, from: 590, until: 605 }).quake?.intensity, 5);
  assert.equal(conditionFromWmo(95), "thunderstorm");
  assert.equal(conditionFromWmo(73), "snow");
  assert.equal(conditionFromWmo(63, 80), "typhoon");
});

test("weather changes where people go", () => {
  const city = createInitialCity();
  const resident = city.citizens.find((c) => c.name.startsWith("Eliot"))!;
  resident.skills = ["biology"];
  const dry = routineStop(resident, 2, 660, {}); // Tuesday is Eliot's day off.
  assert.equal(dry.location_id, "loc_park");
  assert.equal(routineStop(resident, 2, 660, { weather: { condition: "rain", heatwave: false } }).location_id, "loc_mall");
  assert.match(routineStop(resident, 2, 660, { weather: { condition: "snow", heatwave: false } }).activity, /warm at home/);
  const priya = city.citizens.find((c) => c.name.startsWith("Priya"))!;
  assert.equal(routineStop(priya, 1, 600, { weather: { condition: "typhoon", heatwave: false } }).location_id, "loc_hospital");
  const wei = city.citizens.find((c) => c.name.startsWith("Wei"))!;
  assert.match(routineStop(wei, 1, 600, { weather: { condition: "typhoon", heatwave: false } }).activity, /typhoon/);
  assert.match(routineStop(wei, 1, 600, { publicHoliday: true }).location_id, /loc_homes|loc_market|loc_gym/);
  assert.equal(routineStop(priya, 1, 600, { evacuating: true }).location_id, "loc_school");
});

