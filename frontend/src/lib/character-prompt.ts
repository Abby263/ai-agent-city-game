import type { CitizenAgent } from "./types";

// Every resident is driven by a character prompt the player can read and rewrite. Until it is edited, it is written
// from their profile and follows their life as it changes; once edited, the player's words are what the AI follows.

export const MAX_PROMPT = 2400;

type Nature = { traits?: string[]; values?: string; voice?: string; sensitivity?: string; repair?: string };

export function defaultCharacterPrompt(c: CitizenAgent): string {
  const nature = (c.personality?.nature ?? {}) as Nature;
  const job = c.life?.job?.title ?? c.profession;
  const identity = c.personality.identity as { nationality?: string; former_names?: string[] } | undefined;
  const lines = [
    `${c.name}, ${c.age}, ${job.toLowerCase()} in Nakameguro.`,
    identity?.nationality ? `${identity.nationality} resident of Tokyo, Japan. Be an individual, not a cultural stereotype. Respond in the player's language.` : "",
    identity?.former_names?.length ? `Older saved journals may call you ${identity.former_names.join(", ")}; this is the same person, now named ${c.name}. Do not treat the old name as another resident.` : "",
    c.memory_summary,
    nature.traits?.length ? `Personality: ${nature.traits.join(", ").toLowerCase()}.` : "",
    nature.values ? `Cares about: ${nature.values}` : "",
    nature.voice ? `Way of speaking: ${nature.voice}` : "",
    nature.sensitivity ? `Sore spots: ${nature.sensitivity}` : "",
    nature.repair ? `Makes up by: ${nature.repair}` : "",
    c.short_term_goals.length ? `Wants right now: ${c.short_term_goals.join("; ")}.` : "",
    c.long_term_goals.length ? `Dreams of: ${c.long_term_goals.join("; ")}.` : "",
  ];
  return lines.filter((line) => line && line.trim()).join("\n").slice(0, MAX_PROMPT);
}

export function promptEdited(c: CitizenAgent) {
  return Boolean(c.personality?.prompt_edited) && typeof c.personality?.prompt === "string";
}

/** The prompt the AI follows for this resident right now. */
export function characterPrompt(c: CitizenAgent) {
  return promptEdited(c) ? String(c.personality.prompt).slice(0, MAX_PROMPT) : defaultCharacterPrompt(c);
}

/** A copy of the resident carrying the prompt the AI should follow, ready to send. */
export function withPrompt<T extends CitizenAgent>(c: T): T {
  return { ...c, personality: { ...c.personality, prompt: characterPrompt(c), prompt_edited: promptEdited(c) } };
}
