import assert from "node:assert/strict";
import test from "node:test";
import { calendarDay, calendarStartFor, holidayOn } from "../src/lib/calendar";
import { conditionFromWmo, dayWeather, temperatureAt, weatherAt } from "../src/lib/weather";
import { routineStop } from "../src/lib/routine";
import { applyScenario, honesty } from "../src/lib/scenarios";
import type { LifeNews } from "../src/lib/life";
import type { BondChange } from "../src/lib/scenarios";
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

test("playing god: dropped money is handed in or kept, with consequences", () => {
  const city = createInitialCity();
  const news: LifeNews[] = [];
  const bonds: BondChange[] = [];
  for (const c of city.citizens) { c.current_location_id = "loc_homes"; c.current_activity = "Chatting"; }
  const before = city.citizens.reduce((sum, c) => sum + c.money, 0);
  const result = applyScenario(city, { kind: "drop_money", location_id: "loc_homes", amount: 200 }, { sink: (n) => news.push(n), adjustBonds: (b) => bonds.push(...b), cityMinute: 1800 });
  assert.ok(result.focus_id);
  assert.ok(["honesty", "temptation"].includes(news[0].kind));
  const after = city.citizens.reduce((sum, c) => sum + c.money, 0);
  assert.ok(after === before + 20 || after === before + 200, "either a 10% reward or the whole amount");
  assert.ok(honesty(city.citizens.find((c) => c.name.startsWith("Ava"))!) > 70);
});

test("playing god: fires close buildings, love sparks only between adults", () => {
  const city = createInitialCity();
  const news: LifeNews[] = [];
  const tools = { sink: (n: LifeNews) => news.push(n), adjustBonds: () => undefined, cityMinute: 1800 };
  applyScenario(city, { kind: "fire", location_id: "loc_mall" }, tools);
  assert.equal(city.incidents?.[0].kind, "fire");
  const [ava, noah] = ["Ava", "Noah"].map((n) => city.citizens.find((c) => c.name.startsWith(n))!.citizen_id);
  applyScenario(city, { kind: "love_spark", citizen_ids: [ava, noah] }, tools);
  assert.equal(news.at(-1)?.kind, "spark");
  // Keep the safety guard covered with an explicit hypothetical minor, not the shipped cast.
  city.citizens.find((c) => c.citizen_id === ava)!.age = 17;
  applyScenario(city, { kind: "love_spark", citizen_ids: [ava, noah] }, tools);
  assert.equal(news.at(-1)?.kind, "friendship");
  const [yui, daichi] = ["Yui", "Daichi"].map((n) => city.citizens.find((c) => c.name.startsWith(n))!.citizen_id);
  applyScenario(city, { kind: "love_spark", citizen_ids: [yui, daichi] }, tools);
  assert.equal(news.at(-1)?.kind, "spark");
  assert.equal(city.encounter?.target_id, daichi);
});
