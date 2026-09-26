import { bondLabel, bondSnapshot } from "./social";
import type { BondSnapshot, CitizenAgent, Relationship } from "./types";

export type BondMetric = keyof BondSnapshot;

// Connected components use reciprocal friendship, never a resident's one-sided affection.
export function bondClusters(citizens: CitizenAgent[], relationships: Relationship[]) {
  const unvisited = new Set(citizens.map((c) => c.citizen_id));
  const friends = new Map<string, Set<string>>();
  for (const r of relationships) {
    const reverse = relationships.find((other) => other.citizen_id === r.other_citizen_id && other.other_citizen_id === r.citizen_id);
    if (["Friends", "Close friends"].includes(bondLabel(r)) && reverse && ["Friends", "Close friends"].includes(bondLabel(reverse))) {
      const neighbors = friends.get(r.citizen_id) ?? new Set<string>();
      neighbors.add(r.other_citizen_id);
      friends.set(r.citizen_id, neighbors);
    }
  }
  const clusters: string[][] = [];
  for (const citizen of citizens) {
    if (!unvisited.has(citizen.citizen_id)) continue;
    const group: string[] = [], queue = [citizen.citizen_id];
    unvisited.delete(citizen.citizen_id);
    while (queue.length) {
      const id = queue.shift()!;
      group.push(id);
      for (const neighbor of friends.get(id) ?? []) {
        if (unvisited.delete(neighbor)) queue.push(neighbor);
      }
    }
    clusters.push(group);
  }
  return clusters.sort((a, b) => b.length - a.length);
}

export function bondValue(relationship: Relationship, metric: BondMetric) {
  return bondSnapshot(relationship)[metric];
}

// A strongest-contact spanning forest keeps the overview legible; focusing a person shows every direction.
export function overviewBonds(relationships: Relationship[], metric: BondMetric) {
  const pairs = relationships.filter((r) => r.citizen_id < r.other_citizen_id).flatMap((r) => {
    const reverse = relationships.find((v) => v.citizen_id === r.other_citizen_id && v.other_citizen_id === r.citizen_id);
    if (!reverse) return [];
    const mutual = ["Friends", "Close friends"].includes(bondLabel(r)) && ["Friends", "Close friends"].includes(bondLabel(reverse));
    if (!mutual && !r.history?.length && !reverse.history?.length) return [];
    return [{ r, weight: (bondValue(r, metric) + bondValue(reverse, metric)) / 2, mutual }];
  }).sort((a, b) => Number(b.mutual) - Number(a.mutual) || b.weight - a.weight || a.r.relationship_id.localeCompare(b.r.relationship_id));
  const parent = new Map<string, string>();
  const root = (id: string): string => parent.has(id) ? root(parent.get(id)!) : id;
  return pairs.filter(({ r }) => {
    const a = root(r.citizen_id), b = root(r.other_citizen_id);
    if (a === b) return false;
    parent.set(a, b);
    return true;
  }).map(({ r }) => r);
}
