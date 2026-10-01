import * as THREE from "three";
import { Art } from "./materials";

const random = (seed: number) => {
  const n = Math.sin(seed * 91.7 + 17.3) * 43758.5453;
  return n - Math.floor(n);
};

// Colours owned by town.ts/traffic.ts that should light up after dark.
const WINDOW_GLASS = [0x709ba6, 0x789eaa];
const LAMP_GLASS = 0xffe6a1;

/** Sky dressing and night lighting that respond to the clock without extra real lights. */
export function makeAtmosphere(art: Art, lampHeads: THREE.Vector3[]) {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  const starPositions = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const azimuth = random(i) * Math.PI * 2, elevation = 0.12 + random(i + 500) * 1.3;
    starPositions.set([20 + Math.cos(azimuth) * Math.cos(elevation) * 150, Math.sin(elevation) * 150, 20 + Math.sin(azimuth) * Math.cos(elevation) * 150], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -1;
  root.add(stars);

  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0, fog: false });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), moonMaterial);
  moon.position.set(-40, 70, 65);
  moon.lookAt(20, 0, 20);
  root.add(moon);
  disposables.push(starGeometry, starMaterial, moonMaterial, moon.geometry);

  // Soft light pools read as lamp light without paying for 18 real point lights.
  // Light spilling from a lamp fades out from the pole, it doesn't stop at a hard edge.
  const falloff = document.createElement("canvas");
  falloff.width = falloff.height = 128;
  const fctx = falloff.getContext("2d")!;
  const gradient = fctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.15)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  fctx.fillStyle = gradient;
  fctx.fillRect(0, 0, 128, 128);
  const falloffTexture = new THREE.CanvasTexture(falloff);
  const poolMaterial = new THREE.MeshBasicMaterial({ color: 0xffc97a, map: falloffTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeometry = new THREE.CircleGeometry(1.6, 32);
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, lampHeads.length);
  const matrix = new THREE.Matrix4();
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  lampHeads.forEach((head, i) => pools.setMatrixAt(i, matrix.compose(new THREE.Vector3(head.x, 0.04, head.z), flat, new THREE.Vector3(1, 1, 1))));
  pools.renderOrder = 1;
  root.add(pools);
  disposables.push(poolMaterial, poolGeometry, pools, falloffTexture);

  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(random(i + 40) * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = art.ball(cloud, (p - puffs / 2) * 1.3, random(i * 7 + p) * 0.6, (random(i * 3 + p) - 0.5) * 1.6,
        1.3 + random(p + i) * 0.7, 0.75 + random(p * 2 + i) * 0.35, 1.2, 0xfbfbf7);
      puff.castShadow = true;
    }
    cloud.position.set(-30 + random(i + 9) * 150, 15 + random(i + 3) * 5, -8 + random(i + 21) * 50);
    cloud.userData.speed = 0.35 + random(i + 13) * 0.35;
    clouds.push(cloud);
    root.add(cloud);
  }

  const cloudMaterial = art.material(0xfbfbf7);
  const white = new THREE.Color(0xfbfbf7), storm = new THREE.Color(0x6f7880);
  const glass = WINDOW_GLASS.map((color) => art.material(color));
  const lamps = art.material(LAMP_GLASS);
  for (const material of glass) material.emissive.set(0xffcf7a);
  lamps.emissive.set(0xffe2a0);

  /** `coverage` 0-1 sets how many clouds show; `darkness` 0-1 turns them into storm clouds. */
  function update(night: number, dt: number, animate: boolean, coverage = 0.45, darkness = 0, wind = 0.1) {
    cloudMaterial.color.copy(white).lerp(storm, darkness);
    // Overcast days need window lights sooner.
    night = Math.max(night, darkness * 0.45);
    starMaterial.opacity = Math.max(0, night - 0.35) / 0.65;
    moonMaterial.opacity = Math.max(0, night - 0.3) / 0.7;
    poolMaterial.opacity = night * 0.45;
    stars.visible = moon.visible = pools.visible = night > 0.3;
    // Above 1 at night, so bloom makes lit windows and lamps glow.
    for (const material of glass) material.emissiveIntensity = night * 2.1;
    lamps.emissiveIntensity = 0.15 + night * 2.8;
    for (const entry of art.lit) entry.material.emissiveIntensity = entry.day + (entry.night - entry.day) * night;
    clouds.forEach((cloud, i) => {
      if (animate) cloud.position.x += cloud.userData.speed * dt * (1 + wind * 6);
      if (cloud.position.x > 125) cloud.position.x = -35;
      cloud.visible = night < 0.85 && i < Math.round(3 + coverage * 11);
    });
  }
  return { root, update, dispose: () => disposables.forEach((d) => d.dispose()) };
}
