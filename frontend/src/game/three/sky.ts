import * as THREE from "three";

type Key = { hour: number; sky: number; zenith: number; sun: number; sunIntensity: number; ambient: number; night: number };

// Colour script for one day: `sky` is the horizon (and the haze distant things fade into), `zenith` the sky overhead.
// Values between keys blend smoothly, so a 15-minute tick never pops.
const keys: Key[] = [
  { hour: 0, sky: 0x243457, zenith: 0x080f26, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.72, night: 1 },
  { hour: 5, sky: 0x33436b, zenith: 0x0f1a3a, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.74, night: 1 },
  { hour: 6, sky: 0xf1b897, zenith: 0x6680b6, sun: 0xffbf93, sunIntensity: 1.25, ambient: 0.9, night: 0.25 },
  { hour: 7.5, sky: 0xc2dbeb, zenith: 0x4a8fd6, sun: 0xffe6cc, sunIntensity: 2, ambient: 1.02, night: 0 },
  { hour: 16.5, sky: 0xc2dbeb, zenith: 0x4a8fd6, sun: 0xffecd7, sunIntensity: 2.2, ambient: 1.05, night: 0 },
  { hour: 18, sky: 0xf5c69c, zenith: 0x6a8cc4, sun: 0xffc38c, sunIntensity: 1.75, ambient: 0.98, night: 0.1 },
  { hour: 19.5, sky: 0xd58f96, zenith: 0x444b88, sun: 0xff9f80, sunIntensity: 0.95, ambient: 0.85, night: 0.6 },
  { hour: 20.5, sky: 0x33436b, zenith: 0x0e1838, sun: 0xa9bde8, sunIntensity: 0.55, ambient: 0.74, night: 1 },
  { hour: 24, sky: 0x243457, zenith: 0x080f26, sun: 0xa9bde8, sunIntensity: 0.5, ambient: 0.72, night: 1 },
];

export type SkyState = {
  /** The horizon colour, which fog and distance fade into. */
  sky: THREE.Color;
  zenith: THREE.Color;
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
    zenith: a.set(from.zenith).lerp(b.set(to.zenith), smooth).clone(),
    sun: a.set(from.sun).lerp(b.set(to.sun), smooth).clone(),
    sunIntensity: mix(from.sunIntensity, to.sunIntensity),
    ambient: mix(from.ambient, to.ambient),
    night,
    sunDirection: sunDirection.lerp(moonDirection, night).normalize(),
  };
}

/**
 * A sky dome that follows the camera: the horizon colour (which fog fades into) rising to a deeper zenith,
 * with a warm glow and disc around the sun. Night darkens it for the stars and moon.
 */
export function makeSkyDome(radius: number) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      horizon: { value: new THREE.Color() }, zenith: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) }, sunGlow: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_Position = clip.xyww; // always at the far plane, behind everything
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunColor; uniform vec3 sunDirection; uniform float sunGlow;
      varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection);
        float up = clamp(d.y, 0., 1.);
        vec3 color = mix(horizon, zenith, pow(up, .55));
        // Below the horizon the haze thickens into the distant ground.
        color = mix(color, horizon * .9, smoothstep(0., -.08, d.y));
        float s = max(dot(d, normalize(sunDirection)), 0.);
        color += sunColor * sunGlow * (pow(s, 6.) * .18 + pow(s, 48.) * .45 + smoothstep(.9994, .9997, s) * 3.);
        gl_FragColor = vec4(color, 1.);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -2;
  function update(state: SkyState, horizon: THREE.Color, zenith: THREE.Color, gloom: number) {
    material.uniforms.horizon.value.copy(horizon);
    material.uniforms.zenith.value.copy(zenith);
    material.uniforms.sunColor.value.copy(state.sun);
    material.uniforms.sunDirection.value.copy(state.sunDirection);
    // The sun's glow fades behind clouds and at night (the moon is drawn separately).
    material.uniforms.sunGlow.value = (1 - state.night) * (1 - gloom * 0.85);
  }
  return { dome, update, dispose: () => { dome.geometry.dispose(); material.dispose(); } };
}
