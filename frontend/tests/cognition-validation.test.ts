import assert from "node:assert/strict";
import test from "node:test";
import { validateCognition } from "../src/lib/cognition-validation";

const valid = () => ({
  thought: "Consider their point.", mood: "Calm", memory: "We talked.",
  reflection: "Listen carefully.", importance: 0.5,
  conversation: {
    conversation_id: "validation-chat", summary: "A short exchange.",
    transcript: [{ speaker_id: "actor", text: "Hello." }, { speaker_id: "target", text: "Good morning." }],
  },
});
const withOutcome = (outcome: unknown) => ({ ...valid(), participant_outcomes: { actor: outcome } });
const withFeelings = (feelings: unknown) => withOutcome({ feelings });
const withChat = (chat: unknown) => ({ ...valid(), conversation: chat });
const withLines = (transcript: unknown) => withChat({ ...valid().conversation, transcript });
type Case = [string, () => unknown];

const accepted: Case[] = [
  ["optional maps and outcomes omitted", valid],
  ["optional maps explicitly undefined", () => ({ ...valid(), participant_memories: undefined, participant_reflections: undefined, participant_outcomes: undefined })],
  ["empty optional maps", () => ({ ...valid(), participant_memories: {}, participant_reflections: {}, participant_outcomes: {} })],
  ["string memory and reflection maps", () => ({ ...valid(), participant_memories: { actor: "A memory", target: "" }, participant_reflections: { actor: "A reflection", target: "" } })],
  ["null conversation", () => withChat(null)],
  ["conversation ID omitted", () => withChat({ summary: "A reply", transcript: valid().conversation.transcript })],
  ["empty outcome and feelings", () => withOutcome({ feelings: {} })],
  ["complete outcome with feeling boundaries", () => withOutcome({
    relationship_reason: "They listened.", mood: "Happy", thought: "That helped.", task_complete: true,
    relationship_effect: "positive", invitation_response: "accepted",
    feelings: { affection: 8, jealousy: -8, resentment: 0, admiration: 1, reason: "They understood." },
  })],
];
for (const importance of [0, 1]) accepted.push([`importance ${importance}`, () => ({ ...valid(), importance })]);
for (const task_complete of [false, true]) accepted.push([`completion flag ${task_complete}`, () => withOutcome({ task_complete })]);
for (const relationship_effect of ["neutral", "positive", "negative"]) accepted.push([`effect ${relationship_effect}`, () => withOutcome({ relationship_effect })]);
for (const invitation_response of ["accepted", "declined", "undecided", "none"]) accepted.push([`invitation ${invitation_response}`, () => withOutcome({ invitation_response })]);

for (const [label, make] of accepted) {
  test(`accepts ${label} without mutating input`, () => {
    const input = make(), before = structuredClone(input);
    assert.doesNotThrow(() => validateCognition(input));
    assert.deepEqual(input, before);
  });
}

const rejected: Case[] = [];
for (const input of [null, undefined, false, 1, "response", [], {}]) rejected.push([`nonresponse ${String(input)}`, () => input]);
for (const key of ["thought", "mood", "memory", "reflection"]) {
  for (const value of [undefined, null, 42, [], {}]) rejected.push([`${key}=${JSON.stringify(value)}`, () => ({ ...valid(), [key]: value })]);
}
for (const importance of [undefined, null, "0.5", NaN, Infinity, -Infinity, -0.01, 1.01]) {
  rejected.push([`importance=${String(importance)}`, () => ({ ...valid(), importance })]);
}
for (const key of ["participant_memories", "participant_reflections"]) {
  for (const value of [null, [], "memory", 12, { actor: null }, { actor: 42 }, { actor: [] }, { actor: {} }, { actor: undefined }]) {
    rejected.push([`${key}=${JSON.stringify(value)}`, () => ({ ...valid(), [key]: value })]);
  }
}
for (const participant_outcomes of [null, [], "outcomes", 12, { actor: null }, { actor: [] }, { actor: "outcome" }]) {
  rejected.push([`outcome map ${JSON.stringify(participant_outcomes)}`, () => ({ ...valid(), participant_outcomes })]);
}
for (const task_complete of [null, 0, 1, "true", "false", [], {}]) {
  rejected.push([`completion flag ${JSON.stringify(task_complete)}`, () => withOutcome({ task_complete })]);
}
for (const key of ["relationship_reason", "mood", "thought"]) {
  rejected.push([`numeric outcome ${key}`, () => withOutcome({ [key]: 42 })]);
}
for (const feelings of [null, [], "happy", 42, { reason: 42 }]) rejected.push([`feelings ${JSON.stringify(feelings)}`, () => withFeelings(feelings)]);
for (const key of ["affection", "jealousy", "resentment", "admiration"]) {
  for (const value of [NaN, Infinity, -Infinity, -9, 9, 0.5, "2", null]) {
    rejected.push([`${key}=${String(value)}`, () => withFeelings({ [key]: value })]);
  }
}
for (const key of ["relationship_effect", "invitation_response"]) {
  for (const value of [null, 42, "invalid", {}]) rejected.push([`${key}=${JSON.stringify(value)}`, () => withOutcome({ [key]: value })]);
}
for (const chat of [undefined, false, 42, "chat", [], {}, { ...valid().conversation, summary: 42 }, { ...valid().conversation, conversation_id: 42 }]) {
  rejected.push([`malformed conversation ${JSON.stringify(chat)}`, () => withChat(chat)]);
}
for (const transcript of [
  undefined, null, {}, "lines", [], [null], [42], ["line"], [[]], [{}],
  [{ speaker_id: 42, text: "Hello" }], [{ speaker_id: "actor", text: 42 }],
  [{ speaker_id: "actor", text: "" }], [{ speaker_id: "actor", text: " \n\t " }],
  [{ speaker_id: "actor" }], [{ text: "Hello" }],
  [...valid().conversation.transcript, { speaker_id: "target", text: null }],
]) rejected.push([`malformed transcript ${JSON.stringify(transcript)}`, () => withLines(transcript)]);

for (const [label, make] of rejected) {
  test(`rejects ${label} without mutating input`, () => {
    const input = make(), before = structuredClone(input);
    assert.throws(() => validateCognition(input), {
      name: "Error", message: "Invalid AI response; no conversation or memories were committed.",
    });
    assert.deepEqual(input, before);
  });
}
