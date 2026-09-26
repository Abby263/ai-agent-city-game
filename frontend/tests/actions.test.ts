import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { actionBlocked, performAction } from "../src/lib/actions";
import type { LifeNews } from "../src/lib/life";
import type { BondChange } from "../src/lib/scenarios";
import type { Relationship } from "../src/lib/types";

const person = (city: ReturnType<typeof createInitialCity>, name: string) => city.citizens.find((c) => c.name.startsWith(name))!;
function tools(bond: Partial<Relationship> = {}) {
  const news: LifeNews[] = [], bonds: BondChange[] = [];
  return { news, bonds, tools: { sink: (n: LifeNews) => news.push(n), adjustBonds: (b: BondChange[]) => bonds.push(...b), bond: () => ({ trust: 50, warmth: 50, familiarity: 40, ...bond }) as Relationship } };
}

test("everyone is an adult: anyone can do anything, except romance within a family", () => {
  const city = createInitialCity();
  assert.ok(city.citizens.every((c) => c.age >= 18), "nobody in Nakameguro is under 18");
  const [ava, leo, tom, hannah, yui, daichi, priya] = ["Ava", "Leo", "Tom", "Hannah", "Yui", "Daichi", "Priya"].map((n) => person(city, n));
  assert.equal(actionBlocked(city, ava, leo, "ask_out"), null);
  assert.equal(actionBlocked(city, tom, leo, "slap"), null, "grown-ups can fall out, even with family");
  assert.match(actionBlocked(city, priya, ava, "flirt")!, /family/);
  assert.equal(actionBlocked(city, tom, hannah, "kiss"), null, "married couples can kiss");
  assert.match(actionBlocked(city, yui, daichi, "kiss")!, /Only partners/);
  assert.equal(actionBlocked(city, yui, daichi, "ask_out"), null);
});

test("the child-safety rules still hold if a child ever lives here", () => {
  const city = createInitialCity();
  const [ava, leo, tom] = ["Ava", "Leo", "Tom"].map((n) => person(city, n));
  ava.age = leo.age = 13;
  assert.equal(actionBlocked(city, ava, leo, "push"), null, "kids can squabble with kids");
  assert.match(actionBlocked(city, ava, leo, "ask_out")!, /grown-ups/);
  assert.match(actionBlocked(city, tom, leo, "slap")!, /adults never hurt children/);
  assert.match(actionBlocked(city, leo, tom, "hit")!, /children don't fight adults/);
});

test("a hug warms the bond; a slap hurts it and has consequences", () => {
  const city = createInitialCity();
  const [ava, leo] = ["Ava", "Leo"].map((n) => person(city, n));
  const hug = tools();
  performAction(city, ava, leo, "hug", hug.tools);
  assert.ok(hug.bonds[0].warmth! > 0);
  const slap = tools();
  const outcome = performAction(city, leo, ava, "slap", slap.tools);
  assert.ok(slap.bonds[0].warmth! < -15);
  assert.match(outcome.headline, /warning|saw it/, "the police or onlookers react");
  assert.match(outcome.utterance, /Leo slaps Ava/);
});

test("asking someone out depends on how they feel", () => {
  const city = createInitialCity();
  const [yui, daichi] = ["Yui", "Daichi"].map((n) => person(city, n));
  const cold = tools({ warmth: 20 });
  assert.equal(performAction(city, yui, daichi, "ask_out", cold.tools).accepted, false);
  assert.equal(yui.life!.partner_id, null);
  const warm = tools({ warmth: 80, feelings: { affection: 40, jealousy: 0, resentment: 0, admiration: 0 } });
  const yes = performAction(city, yui, daichi, "ask_out", warm.tools);
  if (yes.accepted) {
    assert.equal(yui.life!.partner_id, daichi.citizen_id);
    assert.equal(daichi.life!.relationship_status, "dating");
  }
});
