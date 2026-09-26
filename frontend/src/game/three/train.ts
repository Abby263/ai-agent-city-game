import * as THREE from "three";
import { Art } from "./materials";
import { EAST } from "./district";

const CARS = 4, CAR = 3.4, GAP = 0.25;
const STATION_Z = 20;
const LENGTH = CARS * CAR + (CARS - 1) * GAP;
const FAR = 38; // a run starts and ends inside the tunnels at either end of town

/** A commuter train that stops at Nakameguro Station, alternating direction on the two tracks. */
export function makeTrain(art: Art) {
  const root = new THREE.Group();
  const cars: THREE.Group[] = [];
  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Group();
    art.box(car, 0, 0.95, 0, 1.25, 1.35, CAR, 0xf1f1ec);
    art.box(car, 0, 0.62, 0, 1.27, 0.14, CAR, 0x3a9a6b);
    art.box(car, 0, 1.68, 0, 1.1, 0.12, CAR - 0.1, 0xb9bec2);
    for (const side of [-1, 1]) {
      art.box(car, side * 0.64, 1.12, 0, 0.02, 0.42, CAR - 0.5, 0x709ba6);
      for (const z of [-CAR / 4, CAR / 4]) art.box(car, side * 0.645, 0.95, z, 0.02, 0.9, 0.5, 0x5e7078);
    }
    if (i === 0 || i === CARS - 1) art.box(car, 0, 1.15, (i === 0 ? 1 : -1) * (CAR / 2 + 0.01), 0.9, 0.4, 0.02, 0x709ba6);
    for (const z of [-CAR / 3, CAR / 3]) art.box(car, 0, 0.28, z, 0.9, 0.3, 0.6, 0x3a434b);
    car.position.z = (i - (CARS - 1) / 2) * (CAR + GAP);
    root.add(car);
    cars.push(car);
  }
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.receiveShadow = false; });

  let phase: "arriving" | "dwelling" | "departing" | "waiting" = "arriving";
  let direction = 1; // +1 southbound on the west track, -1 northbound on the east track
  let z = STATION_Z - FAR, timer = 0;
  const place = () => {
    root.position.set(direction > 0 ? EAST.rail[0] : EAST.rail[1], EAST.deck, z);
    root.rotation.y = direction > 0 ? 0 : Math.PI;
    root.visible = phase !== "waiting";
  };
  place();

  function update(dt: number, suspended: boolean) {
    const target = STATION_Z;
    if (phase === "arriving") {
      const remaining = (target - z) * direction;
      const speed = Math.max(1.2, Math.min(11, remaining * 0.9));
      z += direction * Math.min(remaining, speed * dt);
      if (remaining <= 0.02) { phase = "dwelling"; timer = 7; }
    } else if (phase === "dwelling") {
      if (!suspended) timer -= dt;
      if (timer <= 0) phase = "departing";
    } else if (phase === "departing") {
      const travelled = (z - target) * direction;
      z += direction * Math.min(12, 1.2 + travelled * 0.8) * dt;
      if (travelled > FAR) { phase = "waiting"; timer = 9; }
    } else {
      timer -= dt;
      if (timer <= 0 && !suspended) {
        direction = -direction;
        z = STATION_Z - direction * FAR;
        phase = "arriving";
      }
    }
    place();
  }
  return { root, update, length: LENGTH };
}
