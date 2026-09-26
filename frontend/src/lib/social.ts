import type { BondSnapshot, CitizenAgent, Conversation, ConversationImpact, Feelings, Relationship, SocialOutcome } from "./types";

export const feelingNames = {
  affection: "Affection",
  jealousy: "Jealousy",
  resentment: "Resentment",
  admiration: "Admiration",
} as const;
export const emptyFeelings = (): Feelings => ({ affection: 0, jealousy: 0, resentment: 0, admiration: 0 });

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const bondMetrics = { trust: "Trust", warmth: "Warmth", familiarity: "Familiarity", ...feelingNames };
export function bondSnapshot(r: Relationship): BondSnapshot {
  return { ...emptyFeelings(), ...r.feelings, trust: r.trust, warmth: r.warmth, familiarity: r.familiarity };
}

export function conversationImpact(before: Relationship, after: Relationship, outcome: SocialOutcome | undefined,
  moodBefore: string, moodAfter: string, day: number, minute: number): ConversationImpact {
  const cooldown = before.last_changed_at !== undefined && day * 1440 + minute - before.last_changed_at < 120;
  return {
    citizen_id: before.citizen_id, other_citizen_id: before.other_citizen_id,
    before: bondSnapshot(before), after: bondSnapshot(after), mood_before: moodBefore, mood_after: moodAfter,
    reason: outcome?.feelings?.reason?.trim() || outcome?.relationship_reason?.trim() || "No emotional assessment recorded.",
    status: !outcome ? "not_assessed" : cooldown ? "cooldown" : "assessed",
  };
}

export function bondLabel(
  relationship: Pick<Relationship, "trust" | "warmth" | "familiarity">,
) {
  if (relationship.warmth < 30 || relationship.trust < 30) return "Strained";
  if (relationship.trust >= 72 && relationship.warmth >= 72)
    return "Close friends";
  if (
    relationship.trust >= 58 &&
    relationship.warmth >= 58 &&
    relationship.familiarity >= 35
  )
    return "Friends";
  return relationship.familiarity >= 25 ? "Acquaintances" : "Strangers";
}

export function evolveRelationship(
  relationship: Relationship,
  outcome: SocialOutcome | undefined,
  day: number,
  minute: number,
  conversationId?: string,
): Relationship {
  const now = day * 1440 + minute;
  const reason = outcome?.relationship_reason?.trim();
  const effect = reason
    ? (outcome?.relationship_effect ?? "neutral")
    : "neutral";
  // Repeated exchanges can be remembered without farming trust through repeated greetings.
  const eligible =
    relationship.last_changed_at === undefined ||
    now - relationship.last_changed_at >= 120;
  const delta = eligible
    ? effect === "positive"
      ? 2
      : effect === "negative"
        ? -5
        : 0
    : 0;
  const note =
    reason || "A conversation, without evidence of a change in trust.";
  const feelings = { ...emptyFeelings(), ...relationship.feelings };
  const changes: Partial<Feelings> = {};
  const feelingReason = outcome?.feelings?.reason?.trim();
  if (eligible && feelingReason) {
    for (const key of Object.keys(feelingNames) as Array<keyof Feelings>) {
      const raw = outcome?.feelings?.[key];
      const change = typeof raw === "number" && Number.isFinite(raw) ? Math.max(-8, Math.min(8, raw)) : 0;
      const next = clamp(feelings[key] + change);
      if (next !== feelings[key]) changes[key] = next - feelings[key];
      feelings[key] = next;
    }
  }
  return {
    ...relationship,
    familiarity: clamp(relationship.familiarity + (eligible ? 1 : 0)),
    trust: clamp(relationship.trust + delta),
    warmth: clamp(relationship.warmth + delta),
    last_changed_at: eligible ? now : relationship.last_changed_at,
    notes: note,
    feelings,
    history: [
      ...(relationship.history ?? []),
      { day, minute, reason: feelingReason || note, effect: delta === 0 ? "neutral" : effect,
        conversation_id: conversationId, changes, feelings: { ...feelings }, mood: outcome?.mood },
    ].slice(-40),
  };
}
