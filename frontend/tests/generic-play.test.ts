import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { ActInterpretation, ActRequest } from "../src/lib/acts";
import { characterPrompt, defaultCharacterPrompt, withPrompt } from "../src/lib/character-prompt";
import { createInitialCity } from "../src/lib/initial-city";
import { relationName } from "../src/lib/life";
import { nextMoves } from "../src/lib/next-moves";
import { agreedPlan, planTopic } from "../src/lib/plans";
import {
  getSessionCity, saveSessionCity, seedSession, sessionAct, sessionApproach, sessionConversations, sessionMemories, sessionRelationships, sessionSetCharacterPrompt, sessionSetMode,
  sessionSpeak, sessionTakeControl, sessionTick, sessionWalkTo,
} from "../src/lib/session-simulation";
import { activeStories } from "../src/lib/stories";
import type { SessionCognitionRequest, SessionCognitionResponse, SocialOutcome } from "../src/lib/types";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } },
  configurable: true,
});
beforeEach(() => { storage.clear(); seedSession(createInitialCity()); });

const id = (name: string) => getSessionCity()!.citizens.find((c) => c.name.startsWith(name))!.citizen_id;
let n = 0;
/** A stand-in for the conversation model; outcomes lets a test decide how each person answers. */
const talker = (outcomes: Record<string, SocialOutcome> = {}, requests: SessionCognitionRequest[] = []) =>
  async (request: SessionCognitionRequest): Promise<SessionCognitionResponse> => {
    requests.push(request);
    n++;
    return {
      thought: "", mood: "Calm", memory: "We talked.", reflection: "", importance: 0.6,
      conversation: { conversation_id: `g${n}`, game_day: 1, game_minute: 360, location_id: null, actor_ids: [request.actor_id, request.target_id!], summary: "They talked.",
        transcript: [{ speaker_id: request.actor_id, text: `Line ${n} from the actor.` }, { speaker_id: request.target_id!, text: `Reply ${n}.` }] },
      participant_memories: {}, participant_outcomes: outcomes,
    };
  };
/** A stand-in game master: returns a fixed reading of the player's words and remembers what it was asked. */
const master = (reading: Partial<ActInterpretation>, seen: ActRequest[] = []) => async (request: ActRequest): Promise<ActInterpretation> => {
  seen.push(request);
  return { allowed: true, refusal: "", headline: "Something happened.", target_id: request.target?.citizen_id ?? "", involved_ids: [], location_id: "",
    tone: "neutral", intensity: 1, harm: 0, money: 0, proposal: "none", closes_location: false, reaction: "What just happened.", target_memory: "", ...reading };
};
const bond = (from: string, to: string) => sessionRelationships(from).find((r) => r.other_citizen_id === to)!;

test("anything the player writes is read in context and applied with capped effects", async () => {
  const [tom, maya] = ["Tom", "Maya"].map(id);
  const seen: ActRequest[] = [];
  const before = bond(maya, tom);
  const warmth = before.warmth;
  const result = await sessionAct(tom, maya, "Tom shoves Maya in front of everyone", master({ headline: "Tom shoved Maya at the gym.", tone: "hostile", intensity: 2, harm: 1 }, seen), talker());
  assert.equal(seen[0].text, "Tom shoves Maya in front of everyone");
  assert.equal(seen[0].kind, "action");
  assert.ok(seen[0].people.some((p) => p.citizen_id === maya) && seen[0].places.length > 5, "the game master sees the whole scene");
  assert.match(result.headline, /^Tom shoved Maya at the gym\./);
  assert.ok(result.talked, "they react in their own words");
  const after = bond(maya, tom);
  assert.ok(after.warmth < warmth && after.warmth >= warmth - 30, "hurt, but within the cap");
  assert.ok(getSessionCity()!.citizens.find((c) => c.citizen_id === maya)!.life!.conditions.some((c) => c.name === "minor injury"));
  const story = activeStories(getSessionCity()!).find((s) => s.id === result.story_id)!;
  assert.ok(story.beats.some((b) => b.conversation_id), "their reaction is part of the story");
});

test("a relationship step happens only if the person asked says yes", async () => {
  const [yui, daichi] = ["Yui", "Daichi"].map(id);
  const ask = master({ headline: "Yui asked Daichi on a date.", tone: "romantic", proposal: "date" });
  await sessionAct(yui, daichi, "Yui asks Daichi out", ask, talker({ [daichi]: { invitation_response: "declined" } }));
  assert.equal(getSessionCity()!.citizens.find((c) => c.citizen_id === yui)!.life!.relationship_status, "single");
  const yes = await sessionAct(yui, daichi, "Yui asks Daichi out, properly this time", ask, talker({ [daichi]: { invitation_response: "accepted" } }));
  const city = getSessionCity()!;
  assert.equal(city.citizens.find((c) => c.citizen_id === yui)!.life!.partner_id, daichi);
  assert.equal(city.citizens.find((c) => c.citizen_id === daichi)!.life!.relationship_status, "dating");
  assert.ok(activeStories(city).find((s) => s.id === yes.story_id)!.beats.some((b) => /started dating/.test(b.text)));
});

test("romance between relatives is refused whatever the words", async () => {
  const [kenji, haruto] = ["Kenji", "Haruto"].map(id);
  await assert.rejects(sessionAct(kenji, haruto, "Kenji flirts with Haruto", master({ tone: "romantic" }), talker()), /family/);
  await assert.rejects(sessionAct(kenji, haruto, "Anything", master({ allowed: false, refusal: "Not in this game." }), talker()), /Not in this game/);
});

test("a situation happens to people nobody chose, and can close a place for the day", async () => {
  const [elena, sophie] = ["Elena", "Sophie"].map(id);
  const result = await sessionAct(null, null, "A water pipe bursts at the library", master({
    headline: "A water pipe burst at Nakameguro Library.", target_id: elena, involved_ids: [elena, sophie], location_id: "loc_library", closes_location: true, tone: "tense",
  }), talker());
  const city = getSessionCity()!;
  assert.ok(city.incidents?.some((i) => i.kind === "closure" && i.location_id === "loc_library"));
  assert.ok(result.talked, "the people it happened to talk it over");
  assert.deepEqual(new Set(sessionConversations()[0].actor_ids), new Set([elena, sophie]));
});

test("the AI never speaks for the resident you play", async () => {
  const [haruto, kenji] = ["Haruto", "Kenji"].map(id);
  await sessionTakeControl(haruto);
  const requests: SessionCognitionRequest[] = [];
  const result = await sessionAct(kenji, haruto, "Kenji finds Haruto's manga sketchbook", master({ tone: "tense" }), talker({}, requests));
  assert.equal(requests.length, 0, "you answer in Talk yourself");
  assert.equal(result.talked, false);
  const yours = await sessionAct(haruto, kenji, "show Dad the sketchbook", master({ tone: "warm" }), talker({}, requests));
  assert.ok(yours.talked);
  assert.equal(requests[0].player_utterance, "*show Dad the sketchbook*", "your words are yours; only Kenji's reply is generated");
});

test("a choice continues its story instead of starting a new one", async () => {
  const [tom, maya] = ["Tom", "Maya"].map(id);
  const first = await sessionAct(tom, maya, "Tom invites Maya for ramen", master({ headline: "Tom invited Maya for ramen.", tone: "warm" }), talker());
  const before = (getSessionCity()!.stories ?? []).length;
  await sessionAct(maya, tom, "Maya asks whether Hannah knows", master({ headline: "Maya asked Tom whether Hannah knows.", tone: "tense" }), talker(), { storyId: first.story_id });
  const city = getSessionCity()!;
  assert.equal((city.stories ?? []).length, before, "no extra story");
  const story = activeStories(city).find((s) => s.id === first.story_id)!;
  assert.ok(story.beats.some((b) => b.icon === "👉" && b.text.startsWith("You chose: Maya asked Tom")));
  assert.ok(story.beats.at(-1)!.conversation_id, "their reaction is in the same story");
});

test("what happens next comes from what the characters themselves want", async () => {
  const [kenji, haruto, aiko] = ["Kenji", "Haruto", "Aiko"].map(id);
  await sessionAct(haruto, kenji, "Haruto shows Kenji his manga", master({ tone: "warm" }),
    talker({ [kenji]: { next_intention: "Tell Aiko about Haruto's manga" }, [haruto]: { next_intention: "Submit the manga to a magazine" } }));
  const conversation = sessionConversations()[0];
  assert.equal(conversation.intentions?.[kenji], "Tell Aiko about Haruto's manga");
  const city = getSessionCity()!;
  city.citizens.forEach((c) => { c.current_activity = "Relaxing at home"; });
  const moves = nextMoves(city, conversation);
  const tell = moves.find((m) => m.actor_id === kenji)!;
  assert.equal(tell.target_id, aiko, "aimed at the person it names");
  assert.equal(tell.label, "Kenji: Tell Aiko about Haruto's manga");
  assert.equal(moves.find((m) => m.actor_id === haruto)!.target_id, kenji, "otherwise at the person they were talking to");
});

test("successive acts keep the dialogue as history but carry their own topic", async () => {
  const [ava, mateo] = ["Ava", "Mateo"].map(id);
  const requests: SessionCognitionRequest[] = [];
  const generate = talker({}, requests);
  await sessionAct(ava, mateo, "Ava gives Mateo a small wrapped gift", master({ headline: "Ava gave Mateo a gift.", tone: "warm", money: 20 }), generate);
  const first = sessionConversations()[0];
  await sessionAct(ava, mateo, "Ava asks Mateo out for ramen", master({ headline: "Ava asked Mateo out for ramen.", tone: "romantic", proposal: "date" }), generate);
  assert.deepEqual(requests[1].prior_lines, first.transcript);
  assert.notEqual(requests[0].task, requests[1].task);
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

test("each resident's prompt is visible, editable, checked, and sent with every AI call", async () => {
  const tom = id("Tom");
  const profile = getSessionCity()!.citizens.find((c) => c.citizen_id === tom)!;
  assert.equal(characterPrompt(profile), defaultCharacterPrompt(profile), "until edited, it is written from their profile");
  assert.match(characterPrompt(profile), /Tom Brooks, 46/);
  await assert.rejects(sessionSetCharacterPrompt(tom, "Call me on 555-123-4567"), /phone|personal|private|number/i);
  const edited = await sessionSetCharacterPrompt(tom, "Tom secretly hates gardening and dreams of opening a jazz bar.");
  const sent = withPrompt(edited.citizens.find((c) => c.citizen_id === tom)!);
  assert.equal(sent.personality.prompt, "Tom secretly hates gardening and dreams of opening a jazz bar.");
  assert.equal(sent.personality.prompt_edited, true);
  const reset = await sessionSetCharacterPrompt(tom, null);
  assert.equal(characterPrompt(reset.citizens.find((c) => c.citizen_id === tom)!), defaultCharacterPrompt(reset.citizens.find((c) => c.citizen_id === tom)!));
});

test("a plan agreed out loud becomes a real meeting, a refusal does not", () => {
  const city = getSessionCity()!;
  city.clock.minute_of_day = 360;
  const [tom, maya] = ["Tom", "Maya"].map(id);
  const plan = agreedPlan([
    { speaker_id: tom, text: "Thought we might head over to the noodle shop by the station after I finish up at the garden." },
    { speaker_id: maya, text: "Oh, absolutely! I'm up for ramen after the garden today." },
    { speaker_id: tom, text: "I'll see you at the station shop around six." },
    { speaker_id: maya, text: "Awesome, see you there at six then!" },
  ], city);
  assert.ok(plan);
  assert.equal(plan!.location_id, "loc_station");
  assert.equal(plan!.minute, 18 * 60);
  assert.equal(planTopic("Awesome, how about we grab a coffee at Sunny Side and map out the party details?"), "grab a coffee at Sunny Side and map out the party details");
  assert.equal(agreedPlan([
    { speaker_id: tom, text: "Ramen at the station at six today?" },
    { speaker_id: maya, text: "Sorry, I can't tonight." },
  ], city), null);
});

test("the social planner knows who people are to them and what is on their mind", async () => {
  await sessionSetMode("autonomous");
  const asked: Array<{ nearby: Array<{ citizen_id: string; relationship?: string; you_know?: string }>; on_your_mind?: string[] }> = [];
  await sessionTick(talker(), undefined, async (request) => { asked.push(request); return { target_id: null, reason: "Nothing to say right now.", topic: "" }; });
  assert.equal(asked.length, 1);
  const nearby = asked[0].nearby;
  assert.ok(nearby.every((p) => typeof p.relationship === "string" && p.relationship.length > 0), "each nearby person comes with who they are to you");
  const city = getSessionCity()!;
  const asker = city.citizens.find((c) => c.citizen_id === (asked[0] as unknown as { citizen: { citizen_id: string } }).citizen.citizen_id)!;
  for (const p of nearby) {
    const relation = relationName(city, asker, city.citizens.find((c) => c.citizen_id === p.citizen_id)!);
    if (relation && relation !== "family") assert.match(p.relationship!, new RegExp(`your ${relation}`), "family is named as family");
  }
  assert.ok(Array.isArray(asked[0].on_your_mind));
});

test("only people awake and right there see an act, and odd residents never crash it", async () => {
  const [tom, maya] = ["Tom", "Maya"].map(id);
  const city = getSessionCity()!;
  const here = city.citizens.find((c) => c.citizen_id === maya)!.current_location_id;
  const [awake, asleep] = city.citizens.filter((c) => ![tom, maya].includes(c.citizen_id)).slice(0, 2);
  awake.current_location_id = asleep.current_location_id = here;
  awake.current_activity = "Reading";
  asleep.current_activity = "Sleeping";
  const noLife = city.citizens.find((c) => c.citizen_id === maya)!;
  delete (noLife as { life?: unknown }).life;
  saveSessionCity(city);
  await sessionAct(tom, maya, "Tom shoves Maya", master({ tone: "hostile", harm: 2 }), talker());
  const memories = (who: string) => JSON.stringify(sessionMemories(who));
  assert.match(memories(awake.citizen_id), /I saw this happen/);
  assert.doesNotMatch(memories(asleep.citizen_id), /I saw this happen/);
});

test("a proposal is put to the person as a question, and their yes makes it official", async () => {
  const [ava, mateo, yui, daichi] = ["Ava", "Mateo", "Yui", "Daichi"].map(id);
  const requests: SessionCognitionRequest[] = [];
  const ask = master({ headline: "Ava asked Mateo to be her boyfriend.", tone: "romantic", proposal: "date" });
  await sessionTakeControl(ava);
  await sessionApproach(mateo);
  await sessionAct(ava, mateo, "take Mateo's hand and ask him to be her boyfriend", ask, talker({ [mateo]: { invitation_response: "accepted" } }, requests));
  assert.equal(requests[0].proposal, "date", "Mateo is told a question is waiting for his answer");
  assert.equal(getSessionCity()!.citizens.find((c) => c.citizen_id === mateo)!.life!.partner_id, ava);
  // Between two residents, too; an ordinary act asks nothing.
  await sessionAct(yui, daichi, "Yui asks Daichi out", master({ proposal: "date" }), talker({}, requests));
  await sessionAct(yui, daichi, "Yui waves at Daichi", master({}), talker({}, requests));
  assert.deepEqual(requests.slice(1).map((r) => r.proposal), ["date", "none"]);
});

test("your side of a bond grows from good conversations, but your feelings stay yours", async () => {
  const [ava, mateo] = ["Ava", "Mateo"].map(id);
  await sessionTakeControl(ava);
  await sessionApproach(mateo);
  const before = bond(ava, mateo), theirs = bond(mateo, ava).feelings?.affection ?? 0;
  await sessionSpeak(mateo, "Was that you playing guitar last night?", talker({ [mateo]: { relationship_effect: "positive", relationship_reason: "She liked my music.",
    feelings: { affection: 5, reason: "She liked my music." } } }));
  const after = bond(ava, mateo);
  assert.equal(after.warmth, before.warmth + 2);
  assert.equal(after.trust, before.trust + 2);
  assert.deepEqual(after.feelings, before.feelings, "the AI never decides how the player feels");
  assert.equal(bond(mateo, ava).feelings?.affection, theirs + 5, "his are his");
});

test("the resident you play sets off for a plan once, and talking there keeps it", async () => {
  const [ava, mateo] = ["Ava", "Mateo"].map(id);
  const quiet = async () => ({ target_id: null, reason: "Nothing to say right now.", topic: "" });
  await sessionTakeControl(ava);
  await sessionSetMode("autonomous");
  let city = getSessionCity()!;
  const plan = { id: "m1", source_conversation_id: "c1", actor_ids: [ava, mateo], location_id: "loc_park", game_day: city.clock.day,
    game_minute: city.clock.minute_of_day + 45, topic: "the song", status: "scheduled" as const };
  city.meetings = [plan];
  saveSessionCity(city);
  city = await sessionTick(talker(), undefined, quiet);
  assert.equal(city.policy.player_destination, "loc_park", "you head off like everyone else");
  assert.match(city.events.at(-1)!.description + city.events.map((e) => e.description).join(" "), /set off for .* to meet Mateo/);
  await sessionWalkTo("loc_library");
  city = await sessionTick(talker(), undefined, quiet);
  assert.notEqual(city.policy.player_destination, "loc_park", "changing your mind is respected");

  // Kept: you talked with Mateo where and when you agreed.
  city = await sessionApproach(mateo);
  city.meetings = [{ ...plan, id: "m2", player_set_off: true, location_id: city.citizens.find((c) => c.citizen_id === mateo)!.current_location_id, game_minute: city.clock.minute_of_day }];
  saveSessionCity(city);
  await sessionSpeak(mateo, "Hi! I made it.", talker());
  for (let i = 0; i < 6; i++) city = await sessionTick(talker(), undefined, quiet);
  assert.equal(city.meetings!.find((m) => m.id === "m2")!.status, "completed");
});
