import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCity } from "../src/lib/initial-city";
import { actionBlocked, actions, performAction, presentTense, type ActionId } from "../src/lib/actions";
import { roll } from "../src/lib/life";
import type { LifeNews } from "../src/lib/life";
import type { BondChange } from "../src/lib/scenarios";
import type { CitizenAgent, Relationship } from "../src/lib/types";

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
  selectRoll(city, yui, daichi, "ask_out", true);
  assert.equal(performAction(city, yui, daichi, "ask_out", warm.tools).accepted, true);
  assert.equal(yui.life!.partner_id, daichi.citizen_id);
  assert.equal(daichi.life!.relationship_status, "dating");
});

function fixture() {
  const city = createInitialCity();
  const actor = person(city, "Yui"), target = person(city, "Daichi");
  for (const c of [actor, target]) {
    c.age = 18;
    c.life!.partner_id = null;
    c.life!.relationship_status = "single";
    c.life!.parent_ids = [];
    c.life!.children_ids = [];
    c.life!.family_roles = {};
    c.life!.household_id = c.citizen_id;
    c.current_location_id = "loc_park";
  }
  return { city, actor, target };
}

function pair(actor: CitizenAgent, target: CitizenAgent, status: "dating" | "partnered" | "married" = "dating") {
  for (const [c, other] of [[actor, target], [target, actor]]) {
    c.life!.partner_id = other.citizen_id;
    c.life!.relationship_status = status;
  }
}

function selectRoll(city: ReturnType<typeof createInitialCity>, actor: CitizenAgent, target: CitizenAgent, id: ActionId, accepted: boolean) {
  const tick = Array.from({ length: 1000 }, (_, i) => i).find((tick) => (roll(city.clock.day, tick, actor.citizen_id, target.citizen_id, id) < 0.85) === accepted);
  assert.notEqual(tick, undefined, "a deterministic acceptance/rejection tick exists");
  city.clock.tick = tick!;
}

function assertBlocked(city: ReturnType<typeof createInitialCity>, actor: CitizenAgent, target: CitizenAgent, id: ActionId) {
  const before = structuredClone(city);
  const blocked = actionBlocked(city, actor, target, id);
  assert.ok(blocked, `${id} must be blocked`);
  const effects = tools();
  assert.throws(() => performAction(city, actor, target, id, { ...effects.tools, bond: () => assert.fail("blocked actions must not read bonds") }), { message: blocked });
  assert.deepEqual(city, before, "blocked actions leave the city untouched");
  assert.deepEqual(effects.news, []);
  assert.deepEqual(effects.bonds, []);
}

test("the action catalog and present-tense labels cover every public action exactly once", () => {
  const ids: ActionId[] = ["meet", "hug", "high_five", "compliment", "gift", "help", "comfort", "apologize", "share_secret", "invite", "flirt", "ask_out", "confess", "kiss", "propose", "tease", "argue", "insult", "push", "slap", "hit"];
  assert.deepEqual(actions.map((a) => a.id).sort(), [...ids].sort());
  assert.deepEqual(Object.keys(presentTense).sort(), [...ids].sort());
});

for (const spec of actions) {
  test(`${spec.id}: invalid residents and self-targets are rejected without side effects`, () => {
    const { city, actor, target } = fixture();
    assertBlocked(city, actor, actor, spec.id);
    assertBlocked(city, actor, { ...actor }, spec.id);
    assertBlocked(city, { ...actor }, target, spec.id);
    assertBlocked(city, actor, { ...target, citizen_id: "not-in-city" }, spec.id);
    assertBlocked(city, undefined as unknown as CitizenAgent, target, spec.id);
    assertBlocked(city, actor, null as unknown as CitizenAgent, spec.id);
    city.citizens = city.citizens.filter((c) => c !== target);
    assertBlocked(city, actor, target, spec.id);
  });

  test(`${spec.id}: age gates hold at toddler, child and adult boundaries`, () => {
    const { city, actor, target } = fixture();
    if (spec.id === "kiss" || spec.id === "propose") pair(actor, target);
    actor.age = 2;
    assertBlocked(city, actor, target, spec.id);
    actor.age = 3;
    target.age = spec.group === "conflict" ? 5 : 3;
    if (spec.group === "love") assertBlocked(city, actor, target, spec.id);
    else assert.equal(actionBlocked(city, actor, target, spec.id), null);
    if (spec.group === "conflict") {
      target.age = 4;
      assertBlocked(city, actor, target, spec.id);
      actor.age = 18; target.age = 17;
      assertBlocked(city, actor, target, spec.id);
      actor.age = 17; target.age = 18;
      assertBlocked(city, actor, target, spec.id);
      target.age = 17;
      assert.equal(actionBlocked(city, actor, target, spec.id), null);
    }
    if (spec.group === "love") {
      actor.age = 17; target.age = 18;
      assertBlocked(city, actor, target, spec.id);
      actor.age = 18; target.age = 17;
      assertBlocked(city, actor, target, spec.id);
    }
    actor.age = target.age = 18;
    assert.equal(actionBlocked(city, actor, target, spec.id), null);
  });

  for (const boundary of [0, 100]) {
    test(`${spec.id}: executes at numeric boundary ${boundary} with bounded resident state`, () => {
      const { city, actor, target } = fixture();
      for (const c of city.citizens) {
        c.reputation = c.stress = boundary;
        c.life!.emotions = { joy: boundary, sadness: boundary, anger: boundary, fear: boundary };
      }
      actor.money = 20;
      if (spec.id === "kiss" || spec.id === "propose") pair(actor, target);
      selectRoll(city, actor, target, spec.id, true);
      const effects = tools({ trust: boundary, warmth: boundary, familiarity: boundary, feelings: { affection: boundary, resentment: boundary, jealousy: boundary, admiration: boundary } });
      const catalogBefore = structuredClone(actions);
      assert.equal(actionBlocked(city, actor, target, spec.id), null);
      const result = performAction(city, actor, target, spec.id, effects.tools);
      assert.ok(result.headline);
      assert.ok(result.utterance.includes(presentTense[spec.id]));
      assert.equal(effects.news.length, 1);
      assert.equal(effects.news[0].kind, `action_${spec.id}`);
      assert.equal(effects.bonds[0].from, target.citizen_id);
      assert.equal(effects.bonds[0].to, actor.citizen_id);
      assert.equal(actor.money, spec.id === "gift" ? 0 : 20);
      for (const c of city.citizens) {
        for (const value of [c.reputation, c.stress, ...Object.values(c.life!.emotions), ...c.life!.conditions.map((condition) => condition.severity)]) {
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, `${c.name}: ${value} out of bounds`);
        }
      }
      assert.deepEqual(actions, catalogBefore, "executing an action does not mutate the catalog");
    });
  }
}

test("unknown actions are rejected before any effects", () => {
  const { city, actor, target } = fixture();
  for (const id of ["unknown", "", "__proto__", null, undefined]) assertBlocked(city, actor, target, id as ActionId);
});

for (const budget of [-1, 0, 19.99, 20, 20.01, 40, NaN, Infinity, -Infinity]) {
  test(`gift: budget ${budget} is validated on every execution`, () => {
    const { city, actor, target } = fixture();
    actor.money = budget;
    if (!Number.isFinite(budget) || budget < 20) return assertBlocked(city, actor, target, "gift");
    const effects = tools();
    const targetMoney = target.money;
    for (let count = 0; count < Math.floor(budget / 20); count++) performAction(city, actor, target, "gift", effects.tools);
    assert.equal(actor.money, budget % 20);
    assert.equal(target.money, targetMoney, "a gift is not a cash transfer");
    assertBlocked(city, actor, target, "gift");
  });
}

for (const id of ["ask_out", "confess"] as const) {
  test(`${id}: commitments on either side cannot be overwritten`, () => {
    for (const side of ["actor", "target"] as const) {
      for (const status of ["single", "dating", "partnered", "married", "widowed"] as const) {
        const f = fixture();
        f[side].life!.partner_id = "someone-else";
        f[side].life!.relationship_status = status;
        assertBlocked(f.city, f.actor, f.target, id);
      }
      for (const status of ["dating", "partnered", "married"] as const) {
        const f = fixture();
        f[side].life!.relationship_status = status;
        assertBlocked(f.city, f.actor, f.target, id);
      }
    }
  });

  test(`${id}: exact acceptance threshold, deterministic rejection, and repeat attempts`, () => {
    const need = id === "ask_out" ? 50 : 58;
    for (const status of ["single", "widowed"] as const) {
      const { city, actor, target } = fixture();
      actor.life!.relationship_status = target.life!.relationship_status = status;
      selectRoll(city, actor, target, id, true);
      assert.equal(performAction(city, actor, target, id, tools({ warmth: need - 0.01 }).tools).accepted, false);
      assert.equal(actor.life!.partner_id, null);
      selectRoll(city, actor, target, id, false);
      assert.equal(performAction(city, actor, target, id, tools({ warmth: 100 }).tools).accepted, false);
      assert.equal(target.life!.partner_id, null);
      selectRoll(city, actor, target, id, true);
      assert.equal(performAction(city, actor, target, id, tools({ warmth: need }).tools).accepted, true);
      assert.equal(actor.life!.partner_id, target.citizen_id);
      assert.equal(target.life!.partner_id, actor.citizen_id);
      for (const c of [actor, target]) {
        assert.equal(c.life!.relationship_status, "dating");
        assert.equal(c.life!.dating_since, city.clock.day);
      }
      assertBlocked(city, actor, target, id);
      assertBlocked(city, target, actor, id);
    }
  });
}

for (const id of actions.filter((a) => a.group === "love").map((a) => a.id)) {
  test(`${id}: missing life and one-sided family records cannot bypass romance validation`, () => {
    for (const side of ["actor", "target"] as const) {
      const f = fixture();
      delete f[side].life;
      assertBlocked(f.city, f.actor, f.target, id);
      const relatives = fixture();
      relatives[side].life!.family_roles = { [relatives[side === "actor" ? "target" : "actor"].citizen_id]: "cousin" };
      assertBlocked(relatives.city, relatives.actor, relatives.target, id);
    }
  });
}

test("kisses and proposals require reciprocal, consistent partner records", () => {
  for (const id of ["kiss", "propose"] as const) {
    for (const side of ["actor", "target"] as const) {
      for (const partner of [null, "someone-else"]) {
        const f = fixture();
        pair(f.actor, f.target);
        f[side].life!.partner_id = partner;
        assertBlocked(f.city, f.actor, f.target, id);
      }
      for (const status of ["single", "widowed", "married"] as const) {
        const f = fixture();
        pair(f.actor, f.target);
        f[side].life!.relationship_status = status;
        assertBlocked(f.city, f.actor, f.target, id);
      }
    }
  }
  for (const status of ["dating", "partnered", "married"] as const) {
    const { city, actor, target } = fixture();
    pair(actor, target, status);
    assert.equal(actionBlocked(city, actor, target, "kiss"), null);
    if (status !== "dating") assertBlocked(city, actor, target, "propose");
  }
});

test("flirting with one's own partner is not treated as flirting with someone else's partner", () => {
  const { city, actor, target } = fixture();
  pair(actor, target);
  const effects = tools({ warmth: 80 });
  assert.doesNotMatch(performAction(city, actor, target, "flirt", effects.tools).headline, /awkward/);
  assert.equal(effects.bonds[0].feelings?.affection, 8);
  actor.life!.partner_id = null;
  actor.life!.relationship_status = "single";
  target.life!.partner_id = "someone-else";
  assert.match(performAction(city, actor, target, "flirt", tools({ warmth: 80 }).tools).headline, /awkward/);
});

test("proposals use the exact threshold and schedule only one wedding, including reversed proposals", () => {
  const { city, actor, target } = fixture();
  pair(actor, target);
  city.gatherings = [];
  selectRoll(city, actor, target, "propose", true);
  assert.equal(performAction(city, actor, target, "propose", tools({ warmth: 74.99 }).tools).accepted, false);
  assert.equal(city.gatherings.length, 0);
  assert.equal(performAction(city, actor, target, "propose", tools({ warmth: 75 }).tools).accepted, true);
  assert.equal(city.gatherings.length, 1);
  const wedding = city.gatherings[0];
  assert.deepEqual(wedding.host_ids, [actor.citizen_id, target.citizen_id]);
  assert.ok(wedding.day > city.clock.day);
  assert.equal((wedding.day - 1) % 7, 5);
  assertBlocked(city, actor, target, "propose");
  assertBlocked(city, target, actor, "propose");
  city.clock.day = wedding.day;
  assertBlocked(city, actor, target, "propose");
  pair(actor, target, "married");
  assertBlocked(city, actor, target, "propose");
});

test("an outstanding wedding for either person prevents another proposal", () => {
  for (const side of ["actor", "target"] as const) {
    const f = fixture();
    pair(f.actor, f.target);
    f.city.gatherings = [{ id: "existing", kind: "wedding", title: "Existing wedding", host_ids: [f[side].citizen_id, "someone-else"], guest_ids: [], location_id: "loc_shrine", day: f.city.clock.day + 1, start: 780, end: 960 }];
    assertBlocked(f.city, f.actor, f.target, "propose");
  }
});

for (const id of ["push", "slap", "hit"] as const) {
  test(`${id}: repeated physical actions stay bounded and do not duplicate injuries`, () => {
    const { city, actor, target } = fixture();
    actor.personality.nature = { kindness: "kind" };
    const effects = tools();
    for (let tick = 0; tick < 200; tick++) {
      city.clock.tick = tick;
      performAction(city, actor, target, id, effects.tools);
    }
    assert.equal(actor.reputation, 0);
    for (const c of city.citizens) {
      for (const value of [c.stress, c.reputation, ...Object.values(c.life!.emotions)]) assert.ok(value >= 0 && value <= 100);
    }
    const injuries = target.life!.conditions.filter((c) => c.name === "minor injury");
    assert.equal(injuries.length, id === "hit" ? 1 : 0);
    if (injuries.length) assert.equal(injuries[0].severity, 42);
  });
}

test("hitting a resident with optional life data absent does not crash", () => {
  const { city, actor, target } = fixture();
  delete target.life;
  const tick = Array.from({ length: 1000 }, (_, i) => i).find((tick) => roll(city.clock.day, tick, target.citizen_id, "hurt") < 0.6);
  assert.notEqual(tick, undefined);
  city.clock.tick = tick!;
  assert.doesNotThrow(() => performAction(city, actor, target, "hit", tools().tools));
  assert.equal(target.life, undefined, "actions do not migrate old life data");
});

test("hug, tease and flirt switch reactions only across their exact thresholds", () => {
  for (const resentment of [40, 40.01]) {
    const { city, actor, target } = fixture();
    const effects = tools({ feelings: { affection: 0, admiration: 0, jealousy: 0, resentment } });
    const outcome = performAction(city, actor, target, "hug", effects.tools);
    assert.equal(outcome.headline.includes("pulled away"), resentment > 40);
    assert.equal(effects.bonds[0].warmth, resentment > 40 ? 1 : 8);
  }
  for (const warmth of [70, 70.01]) {
    const { city, actor, target } = fixture();
    const effects = tools({ warmth });
    const outcome = performAction(city, actor, target, "tease", effects.tools);
    assert.equal(outcome.headline.includes("both laughed"), warmth > 70);
    assert.equal(effects.bonds[0].warmth, warmth > 70 ? 2 : -4);
  }
  for (const warmth of [44.99, 45]) {
    const { city, actor, target } = fixture();
    const effects = tools({ warmth });
    const outcome = performAction(city, actor, target, "flirt", effects.tools);
    assert.equal(outcome.headline.includes("awkward"), warmth < 45);
    assert.deepEqual(effects.bonds[0].feelings, warmth < 45 ? { resentment: 3 } : { affection: 8 });
  }
});

test("only awake, co-located witnesses age five or older receive witness effects", () => {
  const { city, actor, target } = fixture();
  const witnesses = city.citizens.filter((c) => c !== actor && c !== target).slice(0, 4);
  city.citizens = [actor, target, ...witnesses];
  for (const c of witnesses) {
    c.age = 5;
    c.current_location_id = target.current_location_id;
    c.current_activity = "Walking";
    c.life!.emotions.fear = 99;
    c.life!.emotions.anger = 99;
  }
  witnesses[1].age = 4;
  witnesses[2].current_activity = "Sleeping";
  witnesses[3].current_location_id = "loc_shrine";
  const before = witnesses.map((c) => structuredClone(c.life!.emotions));
  const effects = tools();
  performAction(city, actor, target, "push", effects.tools);
  assert.deepEqual(effects.bonds.map((b) => b.from), [target.citizen_id, witnesses[0].citizen_id]);
  assert.equal(witnesses[0].life!.emotions.fear, 100);
  assert.equal(witnesses[0].life!.emotions.anger, 100);
  for (let i = 1; i < witnesses.length; i++) assert.deepEqual(witnesses[i].life!.emotions, before[i]);
  assert.deepEqual(effects.news[0].memories!.map((m) => m.citizen_id), [target.citizen_id, actor.citizen_id, witnesses[0].citizen_id]);
});
