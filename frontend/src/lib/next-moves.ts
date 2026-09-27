import type { CitizenAgent, CityState, Conversation } from "./types";

// "What happens next?" comes from the characters, not from a list: after a conversation each person says what they now
// want to do ("Tell Aiko about Haruto's manga"), and the player can let that happen, or write something else.

export type NextMove = { actor_id: string; target_id: string | null; text: string; label: string };

const first = (c: Pick<CitizenAgent, "name">) => c.name.split(" ")[0];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The person an intention is aimed at: someone it names, otherwise the person they were just talking to. */
export function intendedTarget(city: CityState, actor: CitizenAgent, text: string, fallback: string | null) {
  const named = city.citizens.find((c) => c !== actor && new RegExp(`\\b${escape(first(c))}\\b`, "i").test(text));
  return named?.citizen_id ?? fallback;
}

export function nextMoves(city: CityState, conversation: Conversation | undefined, limit = 3): NextMove[] {
  if (!conversation?.intentions) return [];
  const moves: NextMove[] = [];
  for (const [id, raw] of Object.entries(conversation.intentions)) {
    const actor = city.citizens.find((c) => c.citizen_id === id);
    const text = raw.trim();
    if (!actor || !text || /sleep/i.test(actor.current_activity)) continue;
    const other = conversation.actor_ids.find((a) => a !== id) ?? null;
    moves.push({ actor_id: id, target_id: intendedTarget(city, actor, text, other), text, label: `${first(actor)}: ${text}` });
  }
  return moves.slice(0, limit);
}
