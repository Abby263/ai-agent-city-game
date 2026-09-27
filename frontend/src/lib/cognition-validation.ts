import type { SessionCognitionResponse } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate before any journals, relationships or city state are written. */
export function validateCognition(value: unknown): asserts value is SessionCognitionResponse {
  const fail = () => { throw new Error("Invalid AI response; no conversation or memories were committed."); };
  if (!record(value)) return fail();
  for (const key of ["thought", "mood", "memory", "reflection"]) if (typeof value[key] !== "string") fail();
  if (typeof value.importance !== "number" || !Number.isFinite(value.importance) || value.importance < 0 || value.importance > 1) fail();
  for (const key of ["participant_memories", "participant_reflections"]) {
    const entries = value[key];
    if (entries !== undefined && (!record(entries) || Object.values(entries).some((v) => typeof v !== "string"))) fail();
  }
  if (value.participant_outcomes !== undefined) {
    if (!record(value.participant_outcomes)) return fail();
    for (const outcome of Object.values(value.participant_outcomes)) {
      if (!record(outcome)) return fail();
      for (const key of ["relationship_reason", "mood", "thought"]) if (outcome[key] !== undefined && typeof outcome[key] !== "string") fail();
      if (outcome.task_complete !== undefined && typeof outcome.task_complete !== "boolean") fail();
      if (outcome.relationship_effect !== undefined && !["neutral", "positive", "negative"].includes(String(outcome.relationship_effect))) fail();
      if (outcome.invitation_response !== undefined && !["accepted", "declined", "undecided", "none"].includes(String(outcome.invitation_response))) fail();
      if (outcome.feelings !== undefined) {
        if (!record(outcome.feelings)) return fail();
        if (outcome.feelings.reason !== undefined && typeof outcome.feelings.reason !== "string") fail();
        for (const key of ["affection", "jealousy", "resentment", "admiration"]) {
          const delta = outcome.feelings[key];
          if (delta !== undefined && (typeof delta !== "number" || !Number.isFinite(delta) || !Number.isInteger(delta) || Math.abs(delta) > 8)) fail();
        }
      }
    }
  }
  if (value.conversation !== null) {
    const chat = value.conversation;
    if (!record(chat) || !Array.isArray(chat.transcript) || typeof chat.summary !== "string") return fail();
    if (chat.conversation_id !== undefined && typeof chat.conversation_id !== "string") fail();
    if (!chat.transcript.length || chat.transcript.some((line) => !record(line) || typeof line.speaker_id !== "string" || typeof line.text !== "string" || !line.text.trim())) fail();
  }
}
