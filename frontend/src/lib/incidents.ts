import type { CityState } from "./types";

// Something that shuts a place for a while and shows on the map: a fire, an accident, or any closure a player's
// situation causes ("a water pipe bursts at the library").
export type Incident = { id: string; kind: "fire" | "accident" | "closure"; location_id: string; until: number };

export function activeIncidents(city: CityState, now: number) {
  return (city.incidents ?? []).filter((i) => i.until > now);
}
