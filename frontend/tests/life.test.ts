import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import {
  ageInYears, BIRTHS_ENABLED, careNeeded, catchCondition, daysUntilBirthday, DAYS_PER_YEAR, lifeDay, lifeStage, lifeTick, passAway, relationName, relatives,
} from "../src/lib/life";
import type { LifeFactory, LifeNews } from "../src/lib/life";
import type { CityState, DepartedCitizen, Relationship } from "../src/lib/types";

function world() {
  const city = createInitialCity();
  const news: LifeNews[] = [];
  const departed: DepartedCitizen[] = [];
  const factory: LifeFactory = { newCitizen: (c) => city.citizens.push(c), departed: (c) => departed.push(c) };
  return { city, news, departed, factory, sink: (n: LifeNews) => news.push(n) };
}
const find = (city: CityState, name: string) => city.citizens.find((c) => c.name.startsWith(name))!;
const noBonds = () => undefined;

test("the shipped cast is 26 adults with consistent ages, jobs and families", () => {
  const { city } = world();
  assert.equal(city.citizens.length, 26);
  const jobs: Record<string, string> = {
    Ava: "Lab assistant", Mateo: "Barista", Noah: "Trainee fitness instructor", Iris: "Pharmacy technician",
    Leo: "Apprentice technician", Sophie: "Library assistant", Zara: "Junior software engineer",
    Eliot: "Food-court cook", Haruto: "Station staff", Sakura: "Konbini clerk",
  };
  for (const resident of city.citizens) {
    assert.ok(resident.age >= 18, resident.name);
    assert.equal(ageInYears(resident.life!, 1), resident.age);
    assert.equal(resident.life!.pregnancy, null);
    for (const id of resident.life!.parent_ids) {
      const parent = city.citizens.find((c) => c.citizen_id === id);
      if (!parent) { assert.match(id, /^ext_/, "only explicitly external parents may be absent"); continue; }
      assert.ok(parent.age - resident.age >= 20, `${parent.name} and ${resident.name}`);
    }
  }
  for (const [name, job] of Object.entries(jobs)) {
    const resident = find(city, name);
    assert.equal(resident.life!.job!.title, job);
    assert.equal(resident.work_location_id, resident.life!.job!.location_id);
  }
});

test("families are wired together from the profiles", () => {
  const { city } = world();
  const leo = find(city, "Leo");
  assert.equal(relationName(city, leo, find(city, "Hannah")), "mother");
  assert.equal(relationName(city, leo, find(city, "Walter")), "grandfather");
  assert.equal(relationName(city, find(city, "Sophie"), find(city, "Maya")), "sister");
  assert.ok(relatives(city, find(city, "Tom")).includes(leo.citizen_id));
  assert.equal(lifeStage(find(city, "Walter").age), "elder");
});

test("everyone ages one day per day and birthdays throw a party", () => {
  const { city, news, factory, sink } = world();
  const eliot = find(city, "Eliot");
  assert.equal(daysUntilBirthday(eliot.life!, 1), 2);
  city.clock.day = 3;
  lifeDay(city, sink, noBonds, factory);
  assert.equal(eliot.age, 21);
  assert.equal(ageInYears(eliot.life!, 3), 21);
  assert.ok(news.some((n) => n.kind === "birthday" && n.actors.includes(eliot.citizen_id)));
  assert.ok(city.gatherings?.some((g) => g.kind === "birthday" && g.host_ids.includes(eliot.citizen_id)));
});

test("the adult-only cast never conceives or gives birth, even with a stale pregnancy", () => {
  const { city, news, factory, sink } = world();
  const hannah = find(city, "Hannah");
  assert.equal(BIRTHS_ENABLED, false);
  assert.equal(hannah.life!.pregnancy, null);
  assert.doesNotMatch(hannah.current_thought, /due date|cot|pregnan|baby/i);
  const population = city.citizens.length;
  hannah.life!.pregnancy = { partner_id: find(city, "Tom").citizen_id, due_day: 12 };
  city.clock.day = 12;
  lifeDay(city, sink, noBonds, factory);
  assert.equal(city.citizens.length, population);
  assert.ok(city.citizens.every((c) => c.age >= 18 && !c.life?.pregnancy));
  assert.equal(hannah.life!.pregnancy, null);
  assert.ok(!news.some((n) => ["birth", "pregnancy"].includes(n.kind)));
});

test("death removes a resident, leaves grief and schedules a memorial", () => {
  const { city, news, departed, factory, sink } = world();
  const walter = find(city, "Walter");
  passAway(city, walter, "old age", sink, factory);
  assert.ok(!city.citizens.includes(walter));
  assert.equal(departed[0].cause, "old age");
  const leo = find(city, "Leo");
  assert.ok(leo.life!.emotions.sadness > 50);
  assert.equal(leo.mood, "Grieving");
  assert.ok(city.gatherings?.some((g) => g.kind === "funeral" && g.guest_ids.includes(leo.citizen_id)));
  const memory = news.find((n) => n.kind === "death")!.memories!.find((m) => m.citizen_id === leo.citizen_id)!;
  assert.match(memory.content, /grandfather/);
});

test("children never die, even when very ill", () => {
  const { city, factory, sink } = world();
  const ava = find(city, "Ava");
  // A synthetic minor preserves the guard if a future cast reintroduces children.
  ava.age = 12;
  ava.life!.birth_day = 1 - 12 * DAYS_PER_YEAR;
  ava.health = 1;
  for (let day = 2; day < 60; day++) { city.clock.day = day; ava.health = 1; lifeDay(city, sink, noBonds, factory); }
  assert.ok(city.citizens.includes(ava));
  assert.ok(ava.health >= 12);
});

test("sick residents seek care, and the doctor treats them at the hospital", () => {
  const { city, news, sink } = world();
  const noah = find(city, "Noah");
  const flu = catchCondition(noah, "flu", 1)!;
  flu.severity = 45;
  assert.equal(careNeeded(noah, 1)?.place, "loc_hospital");
  const priya = find(city, "Priya");
  for (const c of [noah, priya]) { c.current_location_id = "loc_hospital"; c.x = c.target_x; c.y = c.target_y; }
  priya.current_activity = "Working as doctor";
  lifeTick(city, noah, sink, noBonds);
  assert.equal(flu.treated, true);
  assert.ok(news.some((n) => n.kind === "treated" && n.headline.includes("Dr. Priya Singh")));
});

test("adults who grow close start dating; children never do", () => {
  const { city, news, factory, sink } = world();
  const minor = find(city, "Ava");
  minor.age = 12;
  minor.life!.birth_day = 1 - 12 * DAYS_PER_YEAR;
  const bond = (from: string, to: string) => ({ trust: 75, warmth: 80, familiarity: 60 }) as Relationship;
  lifeDay(city, sink, bond, factory);
  const samir = find(city, "Samir"), elena = find(city, "Elena");
  assert.equal(samir.life!.partner_id, elena.citizen_id);
  assert.equal(elena.life!.relationship_status, "dating");
  assert.ok(city.citizens.filter((c) => c.age < 18).every((c) => c.life!.partner_id === null));
  assert.ok(news.some((n) => n.kind === "dating"));
});

test("in-laws and guardians get the right names", () => {
  const { city } = world();
  assert.equal(relationName(city, find(city, "Hannah"), find(city, "Walter")), "father-in-law");
  assert.equal(relationName(city, find(city, "Walter"), find(city, "Hannah")), "daughter-in-law");
  assert.equal(relationName(city, find(city, "Iris"), find(city, "Elena")), "aunt");
  assert.equal(relationName(city, find(city, "Elena"), find(city, "Iris")), "niece");
});
