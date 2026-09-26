import * as THREE from "three";

type Key = { hour: number; sky: number; sun: number; sunIntensity: number; ambient: number; night: number };

// Colour script for one day. Values between keys blend smoothly, so a 15-minute tick never pops.
const keys: Key[] = [
  { hour: 0, sky: 0x2e3d62, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.72, night: 1 },
  { hour: 5, sky: 0x3b4a70, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.74, night: 1 },
  { hour: 6, sky: 0xe9b9a6, sun: 0xffbf93, sunIntensity: 1.25, ambient: 0.9, night: 0.25 },
  { hour: 7.5, sky: 0xc3dfeb, sun: 0xffe6cc, sunIntensity: 2, ambient: 1.02, night: 0 },
  { hour: 16.5, sky: 0xc3dfeb, sun: 0xffecd7, sunIntensity: 2.2, ambient: 1.05, night: 0 },
  { hour: 18, sky: 0xf0cfae, sun: 0xffc38c, sunIntensity: 1.75, ambient: 0.98, night: 0.1 },
  { hour: 19.5, sky: 0xb49ab8, sun: 0xff9f80, sunIntensity: 0.95, ambient: 0.85, night: 0.6 },
  { hour: 20.5, sky: 0x3b4a70, sun: 0xa9bde8, sunIntensity: 0.55, ambient: 0.74, night: 1 },
  { hour: 24, sky: 0x2e3d62, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.72, night: 1 },
];

export type SkyState = {
  sky: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  ambient: number;
  /** 0 in full daylight, 1 at night: drives windows, lamps, stars and the moon. */
  night: number;
  /** Direction from the town towards the sun (or moon at night). */
  sunDirection: THREE.Vector3;
};

const a = new THREE.Color(), b = new THREE.Color();
export function skyAt(minuteOfDay: number): SkyState {
  const hour = (((minuteOfDay / 60) % 24) + 24) % 24;
  const i = Math.max(0, keys.findIndex((key) => key.hour > hour) - 1);
  const from = keys[i], to = keys[i + 1] ?? keys[i];
  const t = to.hour === from.hour ? 0 : (hour - from.hour) / (to.hour - from.hour);
  const smooth = t * t * (3 - 2 * t);
  const mix = (x: number, y: number) => x + (y - x) * smooth;
  const night = mix(from.night, to.night);
  // The sun rises in the east (+x, over the river), arcs overhead and sets in the west.
  const day = THREE.MathUtils.clamp((hour - 6) / 14, 0, 1);
  const sunDirection = new THREE.Vector3(Math.cos(day * Math.PI), 0.35 + Math.sin(day * Math.PI) * 0.9, 0.3).normalize();
  const moonDirection = new THREE.Vector3(-0.45, 1, 0.35).normalize();
  return {
    sky: a.set(from.sky).lerp(b.set(to.sky), smooth).clone(),
    sun: a.set(from.sun).lerp(b.set(to.sun), smooth).clone(),
    sunIntensity: mix(from.sunIntensity, to.sunIntensity),
    ambient: mix(from.ambient, to.ambient),
    night,
    sunDirection: sunDirection.lerp(moonDirection, night).normalize(),
  };
}
