import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { isWalkable, walkablePoint, type Point } from "./layout";

// Street view: stand in the town at eye height (one unit is about 2 m), drag to look around, click the street or
// use the arrow keys to walk. Movement stays on walkable ground: pavements, roads, paths and plazas.

const EYE = 0.82;
const WALK = 2.4;
const TURN = 1.7;

export class StreetView {
  active = false;
  yaw = 0;
  pitch = 0;
  private fov = 68;
  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private stride = 0;
  private saved: { position: THREE.Vector3; target: THREE.Vector3; fov: number; near: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly controls: OrbitControls) {
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearKeys);
  }

  /** Steps into the street at `at`, looking the way the overhead camera was facing. */
  enter(at: Point) {
    if (!this.active) {
      this.saved = { position: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov, near: this.camera.near };
      const look = this.controls.target.clone().sub(this.camera.position);
      this.yaw = Math.atan2(-look.x, -look.z);
      this.pitch = 0;
    }
    const spot = walkablePoint(at);
    this.position.set(spot.x, 0, spot.z);
    this.target.copy(this.position);
    this.active = true;
    this.controls.enabled = false;
    this.camera.fov = this.fov;
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    this.apply(0);
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.clearKeys();
    this.controls.enabled = true;
    if (this.saved) {
      this.camera.position.copy(this.saved.position);
      this.controls.target.copy(this.saved.target);
      this.camera.fov = this.saved.fov;
      this.camera.near = this.saved.near;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
    this.saved = null;
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0042 * (this.camera.fov / 68);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0042 * (this.camera.fov / 68), -1.25, 1.1);
  }

  zoom(delta: number) {
    this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + delta, 28, 80);
    this.camera.updateProjectionMatrix();
  }

  /** Walks towards a clicked point on the ground, if it's within reach. */
  walkTo(point: Point) {
    const from = { x: this.position.x, z: this.position.z };
    if (Math.hypot(point.x - from.x, point.z - from.z) > 18) return false;
    const spot = walkablePoint(point);
    this.target.set(spot.x, 0, spot.z);
    return true;
  }

  /** One step forward (or back, if negative) along where you're facing. */
  step(distance: number) {
    const ahead = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(distance);
    const next = this.target.clone().add(ahead);
    if (isWalkable({ x: next.x, z: next.z })) this.target.copy(next);
    else {
      const spot = walkablePoint({ x: next.x, z: next.z });
      if (Math.hypot(spot.x - this.target.x, spot.z - this.target.z) < Math.abs(distance) * 1.3) this.target.set(spot.x, 0, spot.z);
    }
  }

  turn(angle: number) {
    this.yaw += angle;
  }

  update(dt: number, reducedMotion: boolean) {
    if (!this.active) return;
    const forward = (this.keys.has("ArrowUp") || this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("ArrowDown") || this.keys.has("KeyS") ? 1 : 0);
    const turning = (this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? 1 : 0) - (this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0);
    if (turning) this.yaw += turning * TURN * dt;
    if (forward) this.step(forward * WALK * dt * 1.6);
    const gap = this.target.clone().sub(this.position);
    const moving = gap.length() > 0.01;
    if (moving) {
      const move = Math.min(gap.length(), WALK * dt);
      this.position.addScaledVector(gap.normalize(), move);
      this.stride += move * 6;
    }
    this.apply(moving && !reducedMotion ? Math.sin(this.stride) * 0.012 : 0);
  }

  private apply(bob: number) {
    this.camera.position.set(this.position.x, EYE + bob, this.position.z);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    // Keep the orbit target in front of you, so leaving street view and other code see a sensible focus.
    this.controls.target.copy(this.camera.position).add(new THREE.Vector3(0, 0, -2).applyQuaternion(this.camera.quaternion));
  }

  private keyDown = (event: KeyboardEvent) => {
    if (!this.active || isTyping(event.target)) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      this.keys.add(event.code);
      event.preventDefault();
    }
  };

  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private clearKeys = () => this.keys.clear();

  dispose() {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clearKeys);
  }
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}
