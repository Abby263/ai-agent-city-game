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

export function bondChanges(before: BondSnapshot, after: BondSnapshot): Partial<BondSnapshot> {
  return Object.fromEntries((Object.keys(bondMetrics) as Array<keyof BondSnapshot>)
    .filter((key) => before[key] !== after[key])
    .map((key) => [key, after[key] - before[key]]));
}

export function partnershipLabel(first: CitizenAgent, second: CitizenAgent): string | null {
  if (first.life?.partner_id !== second.citizen_id || second.life?.partner_id !== first.citizen_id) return null;
  return first.life.relationship_status === "married" && second.life.relationship_status === "married" ? "Married" : "Dating";
}

export function conversationImpact(before: Relationship, after: Relationship, outcome: SocialOutcome | undefined,
  moodBefore: string, moodAfter: string, day: number, minute: number): ConversationImpact {
  const latest = after.history?.at(-1);
  return {
    citizen_id: before.citizen_id, other_citizen_id: before.other_citizen_id,
    before: bondSnapshot(before), after: bondSnapshot(after), mood_before: moodBefore, mood_after: moodAfter,
    reason: outcome?.feelings?.reason?.trim() || outcome?.relationship_reason?.trim() || "No emotional assessment recorded.",
    status: !outcome ? "not_assessed" : latest?.day === day && latest?.minute === minute ? latest.assessment_status ?? "assessed" : "assessed",
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
  if (!outcome) return relationship;
  if (conversationId && relationship.history?.some((entry) => entry.conversation_id === conversationId)) return relationship;
  const now = day * 1440 + minute;
  const reason = outcome?.relationship_reason?.trim();
  const effect = reason
    ? (outcome?.relationship_effect ?? "neutral")
    : "neutral";
  const recent = (relationship.history ?? []).filter((entry) => now >= entry.day * 1440 + entry.minute && now - (entry.day * 1440 + entry.minute) < 120);
  const feelingReason = outcome?.feelings?.reason?.trim();
  const evidence = feelingReason || reason || "";
  const normalized = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
  // Suppress repeated evidence, not every emotion after the first interaction of the hour.
  const repeated = Boolean(evidence) && recent.some((entry) => entry.source === "conversation" && normalized(entry.reason) === normalized(evidence));
  const lastGrowth = recent.findLastIndex((entry) => (entry.changes?.trust ?? 0) > 0 && entry.source === "conversation");
  const lastHurt = recent.findLastIndex((entry) => (entry.changes?.trust ?? 0) < 0 || (entry.changes?.warmth ?? 0) < 0 || (entry.changes?.resentment ?? 0) > 0);
  const growthLimited = effect === "positive" && lastGrowth >= 0 && lastGrowth >= lastHurt;
  const eligible = !repeated && !growthLimited;
  const delta = !repeated && (effect === "negative" || eligible)
    ? effect === "positive"
      ? 2
      : effect === "negative"
        ? -5
        : 0
    : 0;
  const note =
    reason || "A conversation, without evidence of a change in trust.";
  const feelings = { ...emptyFeelings(), ...relationship.feelings };
  if (!repeated && feelingReason) {
    for (const key of Object.keys(feelingNames) as Array<keyof Feelings>) {
      const raw = outcome?.feelings?.[key];
      const change = typeof raw === "number" && Number.isFinite(raw) ? Math.max(-8, Math.min(8, raw)) : 0;
      const next = clamp(feelings[key] + change);
      feelings[key] = next;
    }
  }
  const updated: Relationship = {
    ...relationship,
    familiarity: clamp(relationship.familiarity + (!recent.some((entry) => entry.source === "conversation") && !repeated ? 1 : 0)),
    trust: clamp(relationship.trust + delta),
    warmth: clamp(relationship.warmth + delta),
    notes: note,
    feelings,
  };
  const before = bondSnapshot(relationship), after = bondSnapshot(updated);
  const changes = bondChanges(before, after);
  return {
    ...updated,
    last_changed_at: Object.keys(changes).length ? now : relationship.last_changed_at,
    history: [
      ...(relationship.history ?? []),
      { day, minute, reason: feelingReason || note, effect: delta === 0 ? "neutral" : effect,
        conversation_id: conversationId, changes, before, after, source: "conversation" as const, created_at: new Date().toISOString(),
        assessment_status: repeated ? "repeated" as const : growthLimited ? "cooldown" as const : "assessed" as const, feelings: { ...feelings }, mood: outcome?.mood },
    ].slice(-40),
  };
}
