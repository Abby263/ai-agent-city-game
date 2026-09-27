import type { CitizenAgent } from "./types";

export type CitizenNature = {
  traits: string[];
  values: string;
  voice: string;
  sensitivity: string;
  repair: string;
};

export function citizenNature(citizen: CitizenAgent): CitizenNature | null {
  const value = citizen.personality.nature;
  if (!value || typeof value !== "object") return null;
  const nature = value as Record<string, unknown>;
  return {
    traits: Array.isArray(nature.traits) ? nature.traits.filter((t): t is string => typeof t === "string") : [],
    values: typeof nature.values === "string" ? nature.values : "",
    voice: typeof nature.voice === "string" ? nature.voice : "",
    sensitivity: typeof nature.sensitivity === "string" ? nature.sensitivity : "",
    repair: typeof nature.repair === "string" ? nature.repair : "",
  };
}
