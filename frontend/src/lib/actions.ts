import { catchCondition, isAdult, relatives, roll } from "./life";
import type { LifeSink } from "./life";
import type { BondChange } from "./scenarios";
import type { CitizenAgent, CityState, Emotions, Feelings, Relationship } from "./types";

// Anything one resident can do to another. The player picks who does what to whom; effects follow
// each person's relationship and character, and the two then react in their own AI-generated words.

export type ActionGroup = "talk" | "kind" | "love" | "conflict";
export type ActionId =
  | "meet" | "hug" | "high_five" | "compliment" | "gift" | "help" | "comfort" | "apologize" | "share_secret" | "invite"
  | "flirt" | "ask_out" | "confess" | "kiss" | "propose"
  | "tease" | "argue" | "insult" | "push" | "slap" | "hit";

type Effect = { trust?: number; warmth?: number; familiarity?: number; feelings?: Partial<Feelings>; emotions?: Partial<Emotions> };
type ActionSpec = { id: ActionId; icon: string; label: string; group: ActionGroup; verb: string; target: Effect; actor?: Effect; witness?: number };

export const actions: ActionSpec[] = [
  { id: "meet", icon: "🗣️", label: "Meet & talk", group: "talk", verb: "came over to talk to", target: { familiarity: 4 } },
  { id: "invite", icon: "🍜", label: "Invite for ramen", group: "talk", verb: "invited", target: { warmth: 6, familiarity: 5, emotions: { joy: 10 } } },
  { id: "hug", icon: "🤗", label: "Hug", group: "kind", verb: "hugged", target: { warmth: 8, feelings: { affection: 6 }, emotions: { joy: 12, sadness: -8 } }, actor: { warmth: 4, emotions: { joy: 8 } }, witness: 2 },
  { id: "high_five", icon: "✋", label: "High five", group: "kind", verb: "high-fived", target: { warmth: 4, familiarity: 3, emotions: { joy: 8 } }, actor: { emotions: { joy: 6 } } },
  { id: "compliment", icon: "🌟", label: "Compliment", group: "kind", verb: "complimented", target: { warmth: 6, feelings: { admiration: 6 }, emotions: { joy: 12 } } },
  { id: "gift", icon: "🎁", label: "Give a gift ($20)", group: "kind", verb: "gave a gift to", target: { warmth: 10, feelings: { affection: 5 }, emotions: { joy: 18 } }, witness: 2 },
  { id: "help", icon: "🙌", label: "Offer help", group: "kind", verb: "offered to help", target: { trust: 8, warmth: 5, feelings: { admiration: 4 } }, witness: 3 },
  { id: "comfort", icon: "🫂", label: "Comfort", group: "kind", verb: "comforted", target: { warmth: 8, trust: 5, emotions: { sadness: -25, fear: -10 } } },
  { id: "apologize", icon: "🙇", label: "Apologize", group: "kind", verb: "apologised to", target: { trust: 6, feelings: { resentment: -15 }, emotions: { anger: -20 } }, actor: { emotions: { sadness: -5 } } },
  { id: "share_secret", icon: "🤫", label: "Share a secret", group: "kind", verb: "shared a secret with", target: { trust: 10, familiarity: 8 }, actor: { trust: 6 } },
  { id: "flirt", icon: "😊", label: "Flirt", group: "love", verb: "flirted with", target: { feelings: { affection: 8 }, emotions: { joy: 6 } } },
  { id: "ask_out", icon: "🌹", label: "Ask on a date", group: "love", verb: "asked out", target: { feelings: { affection: 6 } } },
  { id: "confess", icon: "💌", label: "Confess love", group: "love", verb: "confessed their feelings to", target: { feelings: { affection: 8 } } },
  { id: "kiss", icon: "💋", label: "Kiss", group: "love", verb: "kissed", target: { warmth: 6, feelings: { affection: 10 }, emotions: { joy: 15 } }, actor: { feelings: { affection: 8 }, emotions: { joy: 15 } } },
  { id: "propose", icon: "💍", label: "Propose", group: "love", verb: "proposed to", target: { feelings: { affection: 10 } } },
  { id: "tease", icon: "😜", label: "Tease", group: "conflict", verb: "teased", target: { warmth: -4, feelings: { resentment: 6 }, emotions: { anger: 8 } }, witness: -2 },
  { id: "argue", icon: "😤", label: "Argue", group: "conflict", verb: "started an argument with", target: { warmth: -8, feelings: { resentment: 10 }, emotions: { anger: 25 } }, actor: { warmth: -6, emotions: { anger: 25 } }, witness: -3 },
  { id: "insult", icon: "🗯️", label: "Insult", group: "conflict", verb: "insulted", target: { trust: -10, warmth: -12, feelings: { resentment: 18 }, emotions: { sadness: 20, anger: 20 } }, witness: -6 },
  { id: "push", icon: "🫸", label: "Push", group: "conflict", verb: "shoved", target: { trust: -12, warmth: -15, feelings: { resentment: 20 }, emotions: { anger: 25, fear: 10 } }, witness: -8 },
  { id: "slap", icon: "🖐️", label: "Slap", group: "conflict", verb: "slapped", target: { trust: -20, warmth: -22, feelings: { resentment: 30 }, emotions: { anger: 35, sadness: 15 } }, witness: -12 },
  { id: "hit", icon: "👊", label: "Hit", group: "conflict", verb: "hit", target: { trust: -30, warmth: -30, feelings: { resentment: 40 }, emotions: { anger: 35, fear: 30 } }, witness: -15 },
];

const presentTense: Record<ActionId, string> = {
  meet: "comes over to talk to", invite: "invites", hug: "hugs", high_five: "high-fives", compliment: "compliments", gift: "gives a gift to",
  help: "offers to help", comfort: "comforts", apologize: "apologises to", share_secret: "shares a secret with", flirt: "flirts with",
  ask_out: "asks out", confess: "confesses their feelings to", kiss: "kisses", propose: "proposes to", tease: "teases",
  argue: "starts arguing with", insult: "insults", push: "shoves", slap: "slaps", hit: "hits",
};

/** Returns why an action isn't allowed, or null. One game for everyone: kids never date, adults never hurt kids. */
export function actionBlocked(city: CityState, actor: CitizenAgent, target: CitizenAgent, id: ActionId): string | null {
  const spec = actions.find((a) => a.id === id);
  if (!spec) return "Unknown action.";
  if (actor === target) return "Choose someone else.";
  if (actor.age < 3) return `${actor.name.split(" ")[0]} is too little to do that.`;
  if (spec.group === "love") {
    if (!isAdult(actor) || !isAdult(target)) return "Romance is only between grown-ups. Try a kind action instead.";
    const partners = actor.life?.partner_id === target.citizen_id;
    if (!partners && relatives(city, actor).includes(target.citizen_id)) return "They are family.";
    if (id === "kiss" && !partners) return "Only partners kiss. Try asking them on a date first.";
    if (id === "propose" && actor.life?.relationship_status !== "dating") return "Propose once they are dating.";
    if ((id === "ask_out" || id === "confess") && partners) return "They are already together.";
  }
  if (spec.group === "conflict") {
    if (target.age < 5) return "Nobody hurts a little child.";
    if (isAdult(actor) !== isAdult(target)) return "In Nakameguro, adults never hurt children, and children don't fight adults. Try talking instead.";
  }
  if (id === "gift" && actor.money < 20) return "Not enough money for a gift.";
  return null;
}

export type ActionTools = { sink: LifeSink; adjustBonds: (changes: BondChange[]) => void; bond: (from: string, to: string) => Relationship | undefined };
export type ActionOutcome = { headline: string; reason: string; topic: string; utterance: string; accepted?: boolean };

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const first = (c: Pick<CitizenAgent, "name">) => c.name.split(" ")[0];
const nature = (c: CitizenAgent) => JSON.stringify(c.personality.nature ?? {}).toLowerCase();

function feel(c: CitizenAgent, emotions?: Partial<Emotions>) {
  if (!c.life || !emotions) return;
  for (const [key, value] of Object.entries(emotions)) c.life.emotions[key as keyof Emotions] = clamp(c.life.emotions[key as keyof Emotions] + Number(value));
}

/** Applies what an action does to both people and anyone watching. The actor must already be with the target. */
export function performAction(city: CityState, actor: CitizenAgent, target: CitizenAgent, id: ActionId, tools: ActionTools, note = ""): ActionOutcome {
  const spec = actions.find((a) => a.id === id)!;
  const { sink, adjustBonds, bond } = tools;
  const day = city.clock.day, tick = city.clock.tick;
  const toward = bond(target.citizen_id, actor.citizen_id);
  const place = city.locations.find((l) => l.location_id === target.current_location_id)?.name ?? "town";
  const witnesses = city.citizens.filter((c) => c !== actor && c !== target && c.current_location_id === target.current_location_id && c.age >= 5 && !/sleep/i.test(c.current_activity));
  let targetEffect: Effect = { ...spec.target };
  let headline = `${actor.name} ${spec.verb} ${target.name} at ${place}.`;
  let accepted: boolean | undefined;
  const memories: NonNullable<Parameters<LifeSink>[0]["memories"]> = [];

  // Closeness changes how a hug, tease or flirt lands.
  if (id === "hug" && (toward?.feelings?.resentment ?? 0) > 40) { targetEffect = { warmth: 1, emotions: { anger: 5 } }; headline = `${actor.name} tried to hug ${target.name}, who pulled away.`; }
  if (id === "tease" && (toward?.warmth ?? 0) > 70) { targetEffect = { warmth: 2, emotions: { joy: 6 } }; headline = `${actor.name} teased ${target.name}, and they both laughed.`; }
  if (id === "flirt" && (target.life?.partner_id || (toward?.warmth ?? 0) < 45)) { targetEffect = { feelings: { resentment: 3 } }; headline = `${actor.name} flirted with ${target.name}. It was awkward.`; }
  if (id === "gift") actor.money -= 20;
  if (id === "ask_out" || id === "confess" || id === "propose") {
    const warmth = toward?.warmth ?? 0, affection = toward?.feelings?.affection ?? 0;
    const need = id === "propose" ? 75 : id === "confess" ? 58 : 50;
    const free = !target.life?.partner_id || target.life.partner_id === actor.citizen_id;
    accepted = free && warmth + affection / 2 >= need && roll(day, tick, actor.citizen_id, target.citizen_id, id) < 0.85;
    if (accepted && actor.life && target.life) {
      if (id === "propose") {
        const saturday = day + (((5 - ((day - 1) % 7)) + 7) % 7 || 7);
        city.gatherings = [...(city.gatherings ?? []), { id: `wedding-${actor.citizen_id}-${target.citizen_id}`, kind: "wedding", title: `${first(actor)} & ${first(target)}'s wedding`,
          host_ids: [actor.citizen_id, target.citizen_id], guest_ids: [...new Set([...relatives(city, actor), ...relatives(city, target)])], location_id: "loc_shrine", day: saturday + 7, start: 780, end: 960 }];
        headline = `${actor.name} proposed to ${target.name}, who said yes! The wedding is at Hikawa Shrine on day ${saturday + 7}.`;
      } else {
        for (const [l, other] of [[actor.life, target], [target.life, actor]] as const) { l.relationship_status = "dating"; l.partner_id = other.citizen_id; l.dating_since = day; }
        headline = `${actor.name} ${id === "confess" ? "confessed their feelings to" : "asked out"} ${target.name}, and ${first(target)} said yes. They're dating!`;
      }
      feel(actor, { joy: 45 }); feel(target, { joy: 35 });
    } else {
      feel(actor, { sadness: 30 });
      targetEffect = { feelings: { affection: 2 } };
      headline = `${actor.name} ${spec.verb} ${target.name}, but ${first(target)} gently said no${target.life?.partner_id && target.life.partner_id !== actor.citizen_id ? ": they're already with someone" : ""}.`;
    }
  }
  if (id === "hit" && roll(day, tick, target.citizen_id, "hurt") < 0.6) {
    const injury = catchCondition(target, "minor injury", day);
    if (injury) { injury.severity = 42; headline += ` ${first(target)} is hurt.`; }
  }

  adjustBonds([
    { from: target.citizen_id, to: actor.citizen_id, ...targetEffect, reason: `${actor.name} ${spec.verb} me${note ? `: "${note}"` : ""}.` },
    ...(spec.actor ? [{ from: actor.citizen_id, to: target.citizen_id, ...spec.actor, reason: `I ${spec.verb} ${target.name}.` }] : []),
    ...(spec.witness ? witnesses.map((w) => ({ from: w.citizen_id, to: actor.citizen_id, warmth: spec.witness, trust: spec.witness! < 0 ? spec.witness : 0, reason: `I saw ${actor.name} ${spec.verb.split(" ")[0]} ${target.name}.` })) : []),
  ]);
  feel(target, targetEffect.emotions);
  feel(actor, spec.actor?.emotions);
  if (spec.witness && spec.witness < 0) witnesses.forEach((w) => feel(w, { fear: 6, anger: 4 }));

  // Consequences of violence: guilt for kind people, reputation, the police or a parent finding out.
  if (spec.group === "conflict" && ["push", "slap", "hit", "insult"].includes(id)) {
    actor.reputation = clamp(actor.reputation - (id === "hit" ? 15 : id === "slap" ? 8 : 4));
    if (/kind|warm|gentle|patient|care/.test(nature(actor))) feel(actor, { sadness: 20 });
    if (id === "hit" || id === "slap") {
      const officer = city.citizens.find((c) => c.life?.job?.location_id === "loc_police" && c !== actor && c !== target);
      const parent = city.citizens.find((c) => actor.life?.parent_ids.includes(c.citizen_id));
      if (isAdult(actor) && officer) {
        actor.stress = clamp(actor.stress + 25);
        headline += ` Officer ${officer.name} was called and gave ${first(actor)} a serious warning.`;
        memories.push({ citizen_id: officer.citizen_id, content: `I was called because ${actor.name} ${spec.verb} ${target.name} at ${place}. I gave a formal warning.`, importance: 0.6, related_citizen_id: actor.citizen_id });
      } else if (!isAdult(actor) && parent) {
        feel(parent, { sadness: 20, anger: 15 });
        headline += ` ${parent.name} found out, and ${first(actor)} is in big trouble at home.`;
        memories.push({ citizen_id: parent.citizen_id, content: `My child ${actor.name} ${spec.verb} ${target.name} today. We need to talk about this.`, importance: 0.75, related_citizen_id: actor.citizen_id });
      }
    }
  }
  if (witnesses.length && spec.witness) headline += ` ${witnesses.length === 1 ? `${witnesses[0].name} saw it` : `${witnesses.length} people saw it`}.`;

  memories.push(
    { citizen_id: target.citizen_id, content: `${actor.name} ${spec.verb} me at ${place}${note ? ` and said "${note}"` : ""}.${accepted === true ? " I said yes." : accepted === false ? " I said no." : ""}`, importance: spec.group === "conflict" || spec.group === "love" ? 0.85 : 0.6, related_citizen_id: actor.citizen_id },
    { citizen_id: actor.citizen_id, content: `I ${spec.verb.replace("came over to talk to", "went to talk to")} ${target.name} at ${place}.${accepted === true ? " They said yes!" : accepted === false ? " They said no." : ""}`, importance: 0.6, related_citizen_id: target.citizen_id },
    ...witnesses.slice(0, 4).filter(() => Boolean(spec.witness)).map((w) => ({ citizen_id: w.citizen_id, content: `I saw ${actor.name} ${spec.verb.split(" ")[0]} ${target.name} at ${place}.`, importance: 0.5, related_citizen_id: actor.citizen_id })),
  );
  const loud = spec.group === "conflict" || spec.group === "love" || id === "gift";
  sink({ kind: `action_${id}`, icon: spec.icon, headline, actors: [actor.citizen_id, target.citizen_id], priority: loud ? 2 : 1, location_id: target.current_location_id, memories });

  const utterance = `*${first(actor)} ${presentTense[id]} ${first(target)}*`;
  return {
    headline,
    reason: `${headline}${note ? ` ${first(actor)} said: "${note}"` : ""} Now they react to what just happened.`,
    topic: note || spec.label.toLowerCase(),
    utterance: note ? `${utterance} ${note}` : utterance,
    accepted,
  };
}
