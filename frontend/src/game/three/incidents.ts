import * as THREE from "three";
import { Art } from "./materials";
import { arrivals, buildings } from "./layout";
import type { Incident } from "@/lib/scenarios";

/** Flames, smoke and emergency vehicles for fires and accidents the player creates. */
export function makeIncidents(art: Art) {
  const root = new THREE.Group();
  const active = new Map<string, { group: THREE.Group; flames: THREE.Mesh[]; smoke: THREE.Mesh[] }>();
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.9 });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffd35a });
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x5b5d61, transparent: true, opacity: 0.55, depthWrite: false });
  const cone = new THREE.ConeGeometry(0.35, 1.1, 7);
  const puff = new THREE.IcosahedronGeometry(0.6, 1);

  function vehicle(group: THREE.Group, x: number, z: number, body: number, stripe: number, ladder: boolean) {
    const v = new THREE.Group();
    v.position.set(x, 0, z);
    art.box(v, 0, 0.62, 0, 0.95, 0.8, 2.1, body);
    art.box(v, 0, 0.5, 0, 0.97, 0.12, 2.1, stripe);
    art.box(v, 0, 1.1, 0.6, 0.85, 0.3, 0.7, 0x709ba6);
    for (const side of [-0.2, 0.2]) art.box(v, side, 1.1, -0.4, 0.18, 0.1, 0.18, side < 0 ? 0xd8473c : 0x3f7fc2);
    if (ladder) art.box(v, 0, 1.15, -0.3, 0.3, 0.12, 1.6, 0xd9d9d4);
    for (const dx of [-0.46, 0.46]) for (const dz of [-0.65, 0.65]) {
      const wheel = art.cylinder(v, dx, 0.2, dz, 0.2, 0.14, 0x2f3438, 0.2, 10);
      wheel.rotation.z = Math.PI / 2;
    }
    group.add(v);
  }

  function create(incident: Incident) {
    const group = new THREE.Group();
    const building = buildings.find((b) => b.id === incident.location_id);
    const spot = arrivals[incident.location_id] ?? { x: building?.x ?? 20, z: (building?.z ?? 20) + 3 };
    const flames: THREE.Mesh[] = [], smoke: THREE.Mesh[] = [];
    if (incident.kind === "fire") {
      const cx = building?.x ?? spot.x, cz = building?.z ?? spot.z - 2, top = (building?.h ?? 2.5) + 0.4;
      for (let i = 0; i < 9; i++) {
        const flame = new THREE.Mesh(cone, i % 3 ? flameMaterial : coreMaterial);
        flame.position.set(cx + ((i % 3) - 1) * 0.7, top + (i % 2) * 0.2, cz + (Math.floor(i / 3) - 1) * 0.6);
        flame.userData.phase = i * 1.7;
        group.add(flame);
        flames.push(flame);
      }
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Mesh(puff, smokeMaterial);
        s.userData.phase = i / 10;
        s.userData.origin = new THREE.Vector3(cx, top + 0.6, cz);
        group.add(s);
        smoke.push(s);
      }
      vehicle(group, spot.x + 1.6, spot.z + 0.4, 0xd8342c, 0xf2f2ee, true);
    } else {
      for (const dx of [-0.9, 0.9]) {
        art.cylinder(group, spot.x + dx, 0.3, spot.z + 1.2, 0.2, 0.6, 0xf07b2a, 0.03, 10);
        art.box(group, spot.x + dx, 0.32, spot.z + 1.2, 0.3, 0.08, 0.3, 0xf2f2ee);
      }
      vehicle(group, spot.x + 1.8, spot.z + 0.2, 0xf2f2ee, 0x26262b, false);
    }
    root.add(group);
    active.set(incident.id, { group, flames, smoke });
  }

  function sync(incidents: Incident[]) {
    const ids = new Set(incidents.map((i) => i.id));
    for (const [id, entry] of active) if (!ids.has(id)) { entry.group.removeFromParent(); active.delete(id); }
    for (const incident of incidents) if (!active.has(incident.id)) create(incident);
  }

  function update(seconds: number) {
    for (const { flames, smoke } of active.values()) {
      for (const f of flames) f.scale.set(1, 0.7 + Math.abs(Math.sin(seconds * 9 + f.userData.phase)) * 0.8, 1);
      for (const s of smoke) {
        const t = (seconds * 0.25 + s.userData.phase) % 1;
        s.position.copy(s.userData.origin).add(new THREE.Vector3(Math.sin(t * 6 + s.userData.phase * 9) * 0.6 + t * 2, t * 7, t * 0.8));
        s.scale.setScalar(0.5 + t * 1.8);
      }
    }
  }
  const dispose = () => { flameMaterial.dispose(); coreMaterial.dispose(); smokeMaterial.dispose(); cone.dispose(); puff.dispose(); };
  return { root, sync, update, dispose };
}
