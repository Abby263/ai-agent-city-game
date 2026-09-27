import * as THREE from "three";
import type { WeatherNow } from "@/lib/weather";

const RAIN = 2200, SNOW = 1400, BOX = 44, HEIGHT = 26;
const random = (seed: number) => {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/** Rain, snow and lightning drawn in a box that follows the camera, so any district can have weather. */
export function makeWeatherFx() {
  const root = new THREE.Group();
  const rainPositions = new Float32Array(RAIN * 6);
  const rainSeeds = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) rainSeeds.set([random(i) * BOX, random(i + 9000) * HEIGHT, random(i + 17000) * BOX], i * 3);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xbfd4e6, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  root.add(rain);

  const snowPositions = new Float32Array(SNOW * 3);
  const snowSeeds = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) snowSeeds.set([random(i + 3) * BOX, random(i + 5000) * HEIGHT, random(i + 11000) * BOX], i * 3);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
  const snowMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, depthWrite: false });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.frustumCulled = false;
  root.add(snow);

  let time = 0, flash = 0, nextStrike = 3, shake = 0;
  const offset = new THREE.Vector3();

  /** Returns a lightning brightness (0-1) and a camera shake offset for this frame. */
  function update(dt: number, weather: WeatherNow | undefined, center: THREE.Vector3, animate: boolean) {
    time += animate ? dt : 0;
    const rainAmount = weather && weather.condition !== "snow" ? weather.precipitation : 0;
    const snowAmount = weather?.condition === "snow" ? weather.precipitation : 0;
    const wind = weather?.wind ?? 0;
    rain.visible = rainAmount > 0;
    snow.visible = snowAmount > 0;
    rainMaterial.opacity = Math.min(0.55, 0.2 + rainAmount * 0.4);
    snowMaterial.opacity = 0.9;
    const x0 = center.x - BOX / 2, z0 = center.z - BOX / 2;
    if (rain.visible) {
      const count = Math.floor(RAIN * rainAmount);
      rain.geometry.setDrawRange(0, count * 2);
      const slant = wind * 1.4;
      for (let i = 0; i < count; i++) {
        const y = HEIGHT - ((rainSeeds[i * 3 + 1] + time * (22 + wind * 10)) % HEIGHT);
        const x = x0 + ((rainSeeds[i * 3] + time * wind * 9) % BOX), z = z0 + rainSeeds[i * 3 + 2];
        rainPositions.set([x, y, z, x - slant * 0.5, y + 0.9, z], i * 6);
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      const count = Math.floor(SNOW * snowAmount);
      snow.geometry.setDrawRange(0, count);
      for (let i = 0; i < count; i++) {
        const y = HEIGHT - ((snowSeeds[i * 3 + 1] + time * 1.6) % HEIGHT);
        const x = x0 + ((snowSeeds[i * 3] + Math.sin(time * 0.7 + i) * 0.6 + time * wind * 2) % BOX);
        snowPositions.set([x, y, z0 + snowSeeds[i * 3 + 2]], i * 3);
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }
    // Lightning: short double flashes at irregular intervals.
    flash = Math.max(0, flash - dt * 5);
    if (weather?.lightning && animate) {
      nextStrike -= dt;
      if (nextStrike <= 0) { flash = 1; nextStrike = 2.5 + random(time) * 6; }
      if (flash < 0.55 && flash > 0.5) flash = 0.9;
    }
    // Earthquakes shake the camera while they last.
    shake = weather?.quake ? Math.min(1, shake + dt * 3) : Math.max(0, shake - dt * 2);
    const strength = (weather?.quake?.intensity ?? 2) >= 4 ? 0.22 : 0.07;
    offset.set(Math.sin(time * 41) * strength, Math.sin(time * 37 + 1) * strength * 0.5, Math.cos(time * 43) * strength).multiplyScalar(animate ? shake : 0);
    return { flash, offset };
  }
  function dispose() {
    rainGeometry.dispose(); rainMaterial.dispose(); snowGeometry.dispose(); snowMaterial.dispose();
  }
  return { root, update, dispose };
}

const wetGround = new THREE.Color(0xb9c4c6), snowGround = new THREE.Color(0xf3f6f8), white = new THREE.Color(0xffffff);
/** Tints ground materials: darker when wet, whiter under snow. */
export function groundTint(weather: WeatherNow | undefined, target: THREE.Color) {
  if (!weather) return target.copy(white);
  if (weather.condition === "snow") return target.copy(snowGround);
  if (weather.precipitation > 0) return target.copy(white).lerp(wetGround, Math.min(1, weather.precipitation));
  return target.copy(white);
}
