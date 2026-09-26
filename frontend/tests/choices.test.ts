import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { actionBlocked } from "../src/lib/actions";
import { nextChoices } from "../src/lib/choices";
import { createInitialCity } from "../src/lib/initial-city";
import { getSessionCity, seedSession, sessionApproach, sessionCreateSituation, sessionPerformAction, sessionTakeControl } from "../src/lib/session-simulation";
import { activeStories } from "../src/lib/stories";
import type { SessionCognitionRequest, SessionCognitionResponse } from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

let n = 0;
const talk = async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => ({
  thought: "", mood: "Calm", memory: "We talked.", reflection: "", importance: 0.5,
  conversation: { conversation_id: `k${++n}`, game_day: 1, game_minute: 360, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked.",
    transcript: [{ speaker_id: request.actor_id, text: `So, about earlier (${n}).` }, { speaker_id: request.target_id!, text: "Yeah, let us talk." }] },
  participant_memories: {}, participant_outcomes: {},
});
const id = (name: string) => getSessionCity()!.citizens.find((c) => c.name.startsWith(name))!.citizen_id;

test("next choices are allowed moves that fit what just happened", () => {
  const city = getSessionCity()!;
  const [yui, daichi, ava, leo] = ["Yui", "Daichi", "Ava", "Leo"].map(id);
  const romance = nextChoices(city, [yui, daichi], "love_spark");
  assert.equal(romance.length, 3);
  assert.ok(romance.some((c) => ["ask_out", "flirt", "confess"].includes(c.action)));
  // If children ever lived here again, they would never be offered romance.
  const young = structuredClone(city);
  for (const c of young.citizens) if ([ava, leo].includes(c.citizen_id)) c.age = 13;
  const kids = nextChoices(young, [ava, leo], "love_spark");
  assert.equal(kids.length, 3);
  assert.ok(kids.every((c) => !["ask_out", "flirt", "confess", "kiss", "propose"].includes(c.action)), "children never get romance choices");
  const hurt = nextChoices(city, [ava, leo], "action_slap");
  assert.equal(hurt[0].action, "apologize");
  for (const [world, list] of [[city, [...romance, ...hurt]], [young, kids]] as const)
    for (const c of list) {
      const [a, b] = [c.actor_id, c.target_id].map((x) => world.citizens.find((p) => p.citizen_id === x)!);
      assert.equal(actionBlocked(world, a, b, c.action), null);
    }
});

test("the AI never acts on the resident you play", async () => {
  const [ava, leo] = ["Ava", "Leo"].map(id);
  await sessionTakeControl(ava);
  const choices = nextChoices(getSessionCity()!, [ava, leo], "rivalry");
  assert.ok(choices.length > 0);
  assert.ok(choices.every((c) => c.target_id !== ava));
  assert.ok(choices.filter((c) => c.actor_id === ava).every((c) => !c.label.startsWith("Ava")), "your own moves are phrased for you");
});

test("approaching someone brings you to them without an AI call", async () => {
  const [ava, kenji] = ["Ava", "Kenji"].map(id);
  await assert.rejects(sessionApproach(kenji), /Play as someone/);
  await sessionTakeControl(ava);
  const city = await sessionApproach(kenji);
  const [you, them] = [ava, kenji].map((x) => city.citizens.find((c) => c.citizen_id === x)!);
  assert.equal(you.current_location_id, them.current_location_id);
  assert.equal(city.policy.player_destination, null);
});

test("a choice continues its story instead of starting a new one", async () => {
  const [yui, daichi] = ["Yui", "Daichi"].map(id);
  const { story_id } = await sessionCreateSituation({ kind: "rivalry", citizen_ids: [yui, daichi] }, talk);
  const before = (getSessionCity()!.stories ?? []).length;
  const choice = nextChoices(getSessionCity()!, [yui, daichi], "rivalry")[0];
  await sessionPerformAction(choice.actor_id, choice.target_id, choice.action, "", talk, { storyId: story_id });
  const city = getSessionCity()!;
  assert.equal((city.stories ?? []).length, before, "no extra story");
  const story = activeStories(city).find((s) => s.id === story_id)!;
  assert.ok(story.beats.some((b) => b.icon === "👉" && b.text.startsWith("You chose:")));
  assert.ok(story.beats.at(-1)!.conversation_id, "their reaction is in the same story");
  assert.equal(story.latest, `action_${choice.action}`, "the next choices follow the latest move");
});
