import { actionBlocked, actions, presentTense, type ActionId } from "./actions";
import type { CitizenAgent, CityState } from "./types";

// "What happens next?": after a scene or a situation, the player picks the next move for the people in it,
// instead of only watching. Each choice is an ordinary action, so feelings, memories and reactions follow.

export type Choice = { actor_id: string; target_id: string; action: ActionId; icon: string; label: string };

// [who acts (0 = first person, 1 = second), what they do], best first. Blocked moves are skipped.
type Move = [0 | 1, ActionId];
const hurt: Move[] = [[0, "apologize"], [1, "argue"], [1, "hug"], [0, "gift"]];
const romance: Move[] = [[0, "ask_out"], [1, "flirt"], [0, "confess"], [0, "gift"], [1, "tease"]];
const secret: Move[] = [[0, "share_secret"], [0, "gift"], [1, "argue"], [1, "tease"]];
const care: Move[] = [[0, "comfort"], [0, "help"], [1, "hug"], [1, "compliment"]];
const happy: Move[] = [[1, "hug"], [0, "invite"], [1, "tease"], [0, "high_five"]];
// Teasing can land as a joke or sting: tease back, make up, or take it badly.
const playful: Move[] = [[1, "tease"], [0, "hug"], [1, "argue"], [0, "compliment"]];
const everyday: Move[] = [[0, "invite"], [1, "compliment"], [0, "tease"], [1, "share_secret"], [0, "hug"]];
const fillers: Move[] = [[0, "high_five"], [1, "compliment"], [0, "help"], [1, "invite"]];

const conflictIds = new Set(actions.filter((a) => a.group === "conflict").map((a) => a.id as string));
const loveIds = new Set(actions.filter((a) => a.group === "love").map((a) => a.id as string));

function movesFor(kind: string | undefined): Move[] {
  const action = kind?.startsWith("action_") ? kind.slice(7) : "";
  if (action === "tease") return playful;
  if (kind === "rivalry" || conflictIds.has(action)) return hurt;
  if (kind === "love_spark" || loveIds.has(action)) return romance;
  if (kind === "drop_money" || kind === "act_of_kindness" || kind === "lottery") return secret;
  if (kind === "accident" || kind === "fire" || kind === "lost_puppy") return care;
  if (action) return happy;
  return everyday;
}

const first = (c: CitizenAgent) => c.name.split(" ")[0];
// Moves whose words don't read well as "A <verb> B".
const phrasing: Partial<Record<ActionId, (a: string, b: string) => string>> = {
  invite: (a, b) => `${a} invites ${b} for ramen`,
  ask_out: (a, b) => `${a} asks ${b} out`,
};

/** Up to three next moves for a pair. The resident you play can act, but the AI never acts on you. */
export function nextChoices(city: CityState, ids: string[], kind?: string): Choice[] {
  const pair = [...new Set(ids)].map((id) => city.citizens.find((c) => c.citizen_id === id)).filter((c): c is CitizenAgent => !!c && c.age >= 3).slice(0, 2);
  if (pair.length < 2) return [];
  const player = city.policy.player_citizen_id as string | null | undefined;
  const choices: Choice[] = [];
  for (const [who, action] of [...movesFor(kind), ...fillers]) {
    if (choices.length >= 3) break;
    const actor = pair[who], target = pair[1 - who];
    if (target.citizen_id === player || choices.some((c) => c.action === action) || actionBlocked(city, actor, target, action)) continue;
    const spec = actions.find((a) => a.id === action)!;
    const you = actor.citizen_id === player;
    choices.push({ actor_id: actor.citizen_id, target_id: target.citizen_id, action, icon: spec.icon,
      label: you ? `${spec.label} (${first(target)})` : phrasing[action]?.(first(actor), first(target)) ?? `${first(actor)} ${presentTense[action]} ${first(target)}` });
  }
  return choices;
}
