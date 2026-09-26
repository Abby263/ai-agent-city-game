import * as THREE from "three";
import { Art } from "./materials";
import type { CitizenAgent } from "@/lib/types";
import { appearanceFor } from "@/lib/appearance";
import { activityIcon } from "@/lib/activity-icon";
import type { Point } from "./layout";

export class CitizenModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly limbs: THREE.Group[] = [];
  readonly ring: THREE.Mesh;
  readonly label: HTMLButtonElement;
  route: Point[] = [];
  destination: Point | null = null;
  moving = false;
  speaking = false;
  speechPaused = false;
  listening = false;
  /** Asleep at home: the model goes indoors and only the nameplate stays on the map. */
  asleep = false;
  /** Height of the nameplate anchor above the ground, following the person's real height. */
  labelLift = 1.9;
  private walkSpeed = 3.2;
  private belly: THREE.Mesh;
  private umbrella = new THREE.Group();
  private phase = 0;
  private selected = false;

  constructor(
    public citizen: CitizenAgent,
    art: Art,
    onSelect: (id: string) => void,
  ) {
    this.root.name = citizen.citizen_id;
    const colors = appearanceFor(citizen);
    this.root.add(this.body);
    const torso = new THREE.Mesh(
      art.geometry(new THREE.CapsuleGeometry(0.2, 0.29, 4, 10)),
      art.material(colors.shirt),
    );
    torso.position.y = 0.81;
    torso.scale.z = 0.8;
    torso.castShadow = true;
    this.body.add(torso);
    art.ball(this.body, 0, 1.31, 0, 0.285, 0.32, 0.26, colors.skin);
    art.ball(this.body, 0, 1.48, -0.035, 0.31, 0.2, 0.28, colors.hair);
    for (let i = 0; i < 5; i++)
      art.ball(
        this.body,
        -0.2 + i * 0.1,
        1.49 - (i % 2) * 0.04,
        0.17,
        0.105,
        0.105,
        0.1,
        colors.hair,
      );
    if (["cit_009", "cit_022", "cit_027"].includes(citizen.citizen_id)) {
      for (const side of [-1, 1])
        art.ball(
          this.body,
          side * 0.25,
          citizen.citizen_id === "cit_009" ? 1.19 : 1.3,
          -0.09,
          0.1,
          citizen.citizen_id === "cit_009" ? 0.35 : 0.23,
          0.21,
          colors.hair,
        );
    }
    if (citizen.citizen_id === "cit_028")
      art.ball(this.body, 0, 1.67, -0.04, 0.16, 0.14, 0.16, colors.hair);
    for (const side of [-1, 1]) {
      art.ball(
        this.body,
        side * 0.105,
        1.33,
        0.235,
        0.046,
        0.061,
        0.026,
        0xffffff,
      );
      art.ball(
        this.body,
        side * 0.106,
        1.324,
        0.258,
        0.024,
        0.039,
        0.014,
        0x343443,
      );
      art.ball(
        this.body,
        side * 0.15,
        1.24,
        0.221,
        0.047,
        0.025,
        0.019,
        0xd59c8d,
      );
      art.ball(
        this.body,
        side * 0.275,
        1.31,
        0,
        0.06,
        0.085,
        0.065,
        colors.skin,
      );
    }
    art.ball(this.body, 0, 1.23, 0.262, 0.035, 0.018, 0.013, 0xa9776d);
    art.box(this.body, 0, 0.85, -0.19, 0.32, 0.36, 0.15, 0x8b786f);
    for (const side of [-1, 1])
      art.box(this.body, side * 0.13, 0.9, 0.14, 0.035, 0.33, 0.035, 0xf2e7d4);
    for (let i = 0; i < 4; i++) {
      const arm = i > 1,
        side = i % 2 ? 1 : -1;
      const pivot = new THREE.Group();
      pivot.position.set(side * (arm ? 0.27 : 0.115), arm ? 0.97 : 0.57, 0);
      const limb = new THREE.Mesh(
        art.geometry(
          new THREE.CapsuleGeometry(
            arm ? 0.065 : 0.08,
            arm ? 0.24 : 0.28,
            3,
            8,
          ),
        ),
        art.material(arm ? colors.shirt : 0x566375),
      );
      limb.position.y = -0.18;
      limb.castShadow = true;
      pivot.add(limb);
      if (arm) art.ball(pivot, 0, -0.37, 0.01, 0.075, 0.08, 0.07, colors.skin);
      else {
        art.ball(pivot, 0, -0.44, 0.045, 0.1, 0.075, 0.17, 0xf5ead6);
        art.box(pivot, 0, -0.49, 0.045, 0.17, 0.04, 0.26, 0xc2c3b5);
      }
      this.body.add(pivot);
      this.limbs.push(pivot);
    }
    this.belly = art.ball(this.body, 0, 0.74, 0.14, 0.2, 0.2, 0.18, colors.shirt);
    this.belly.visible = false;
    // A folding umbrella, opened when it rains and the resident is outside.
    const canopy = new THREE.Mesh(art.geometry(new THREE.ConeGeometry(0.62, 0.32, 8, 1, true)),
      art.material([0xd8473c, 0x3f7fc2, 0xf2d24b, 0x3a9a6b, 0xe8e6df, 0x8d6fb5][citizen.citizen_id.charCodeAt(citizen.citizen_id.length - 1) % 6]));
    canopy.position.y = 2.02;
    (canopy.material as THREE.Material).side = THREE.DoubleSide;
    this.umbrella.add(canopy);
    art.cylinder(this.umbrella, 0, 1.62, 0, 0.015, 0.8, 0x3a3a3f);
    this.umbrella.position.set(0.18, 0, 0.08);
    this.umbrella.visible = false;
    this.body.add(this.umbrella);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdb8a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.ring = new THREE.Mesh(
      art.geometry(new THREE.RingGeometry(0.44, 0.49, 40)),
      ringMat,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.09;
    this.root.add(this.ring);
    this.label = document.createElement("button");
    this.label.type = "button";
    this.label.className = "citizen-nameplate";
    this.setCitizen(citizen);
    this.label.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(citizen.citizen_id);
    });
    this.root.userData.citizenId = citizen.citizen_id;
  }
  setCitizen(citizen: CitizenAgent) {
    this.citizen = citizen;
    const life = citizen.life;
    if (life) {
      // The model is drawn at a 155 cm teenager's size; scale to real height and build.
      const scale = Math.max(0.36, life.height_cm / 155);
      const build = Math.min(1.35, Math.max(0.85, life.weight_kg / (life.height_cm / 100) ** 2 / 20));
      this.body.scale.set(scale * build, scale, scale * Math.min(1.2, build));
      this.labelLift = 1.9 * scale + 0.1;
      this.belly.visible = Boolean(life.pregnancy);
      this.walkSpeed = citizen.age >= 75 ? 2.2 : citizen.age >= 65 ? 2.6 : 3.2;
    }
    this.asleep = /sleep/i.test(citizen.current_activity) && citizen.current_location_id === citizen.home_location_id;
    const text = `${activityIcon(citizen.current_activity)} ${citizen.name.split(" ")[0]}`;
    if (this.label.textContent !== text) this.label.textContent = text;
    this.label.title = `${citizen.name}: ${citizen.current_activity}`;
    this.label.setAttribute("aria-label", `Select ${citizen.name} on map, ${citizen.current_activity}`);
  }
  setUmbrella(open: boolean) {
    this.umbrella.visible = open;
  }
  select(selected: boolean) {
    this.selected = selected;
    this.ring.visible = selected || this.speaking || this.listening;
    this.label.setAttribute("aria-pressed", String(selected));
  }
  update(dt: number, reducedMotion: boolean) {
    this.ring.visible = this.selected || this.speaking || this.listening;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.speaking ? 0x89ffe0 : this.listening ? 0xaacfee : 0xffdb8a);
    this.label.dataset.speaking = String(this.speaking);
    this.label.dataset.listening = String(this.listening);
    this.moving = this.route.length > 0;
    let travel = dt * this.walkSpeed;
    while (travel > 0 && this.route.length) {
      const point = this.route[0];
      const dx = point.x - this.root.position.x,
        dz = point.z - this.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.025) {
        this.route.shift();
        continue;
      }
      this.body.rotation.y = THREE.MathUtils.lerp(
        this.body.rotation.y,
        this.body.rotation.y +
          Math.atan2(
            Math.sin(Math.atan2(dx, dz) - this.body.rotation.y),
            Math.cos(Math.atan2(dx, dz) - this.body.rotation.y),
          ),
        Math.min(1, dt * 12),
      );
      const step = Math.min(travel, distance);
      this.root.position.x += (dx / distance) * step;
      this.root.position.z += (dz / distance) * step;
      travel -= step;
      if (step === distance) this.route.shift();
    }
    this.phase += dt * (this.moving ? 11 : 1.6);
    this.body.position.y = reducedMotion
      ? 0
      : this.moving
        ? Math.abs(Math.sin(this.phase)) * 0.045
        : Math.sin(this.phase) * 0.008;
    this.limbs.forEach((limb, i) => {
      limb.rotation.x =
        this.moving && !reducedMotion
          ? Math.sin(this.phase + (i % 2 ? Math.PI : 0)) * (i < 2 ? 0.5 : -0.35)
          : this.speaking && !this.speechPaused && i > 1 && !reducedMotion
            ? -0.25 + Math.sin(this.phase * 3 + i) * 0.16 : 0;
    });
    this.ring.scale.setScalar(
      this.selected && !reducedMotion ? 1 + Math.sin(this.phase) * 0.025 : 1,
    );
  }
  dispose() {
    this.label.remove();
    (this.ring.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}
