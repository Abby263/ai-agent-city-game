import * as THREE from "three";
import { SurfaceLibrary, type Surface } from "./surfaces";

// Shared geometry and material ownership makes both draw-call batching and teardown explicit.
export class Art {
  readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  readonly surfaces = new SurfaceLibrary();
  /** What each colour is made of; unlabelled colours are plain painted material. */
  private readonly madeOf = new Map<number, Surface>();
  readonly textures: THREE.Texture[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly unitBox = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  readonly sphere = this.geometry(new THREE.IcosahedronGeometry(1, 1));
  // Smooth facial silhouettes without multiplying geometry allocations per resident.
  readonly humanSphere = this.geometry(new THREE.SphereGeometry(1, 16, 12));
  readonly ramp: THREE.DataTexture;

  constructor() {
    this.ramp = new THREE.DataTexture(
      new Uint8Array([
        115, 115, 115, 255, 185, 185, 185, 255, 255, 255, 255, 255,
      ]),
      3,
      1,
    );
    this.ramp.minFilter = this.ramp.magFilter = THREE.NearestFilter;
    this.ramp.generateMipmaps = false;
    this.ramp.needsUpdate = true;
    this.textures.push(this.ramp);
  }
  private blob?: { geometry: THREE.PlaneGeometry; materials: Map<number, THREE.MeshBasicMaterial> };
  /**
   * A soft dark patch on the ground under something (a person, a car): the contact shadow that stops it
   * looking pasted on. Created lazily, shared by everyone, never picked by clicks.
   */
  contactShadow(parent: THREE.Object3D, width: number, depth: number, opacity = 0.34) {
    if (!this.blob) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(0.55, "rgba(0,0,0,0.55)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      this.textures.push(texture);
      const geometry = this.geometry(new THREE.PlaneGeometry(1, 1));
      geometry.rotateX(-Math.PI / 2);
      this.blob = { geometry, materials: new Map() };
      this.blob.materials.set(-1, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: 0x0e1622 }));
    }
    const key = Math.round(opacity * 100);
    let material = this.blob.materials.get(key);
    if (!material) {
      material = this.blob.materials.get(-1)!.clone();
      material.opacity = opacity;
      this.blob.materials.set(key, material);
    }
    const mesh = new THREE.Mesh(this.blob.geometry, material);
    mesh.scale.set(width, 1, depth);
    mesh.position.y = 0.03;
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    parent.add(mesh);
    return mesh;
  }
  /** Things that light up after dark (signs, shop interiors, lanterns): how brightly by day and at night. */
  readonly lit: Array<{ material: THREE.MeshStandardMaterial; day: number; night: number }> = [];
  glow(material: THREE.MeshStandardMaterial, color: THREE.ColorRepresentation, day: number, night: number) {
    if (this.lit.some((entry) => entry.material === material)) return;
    material.emissive.set(color);
    if (material.map) material.emissiveMap = material.map;
    material.emissiveIntensity = day;
    this.lit.push({ material, day, night });
  }
  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
  /** Labels colours with what they are made of. Call before those colours are first used. */
  tag(surface: Surface, ...colors: number[]) {
    for (const color of colors) this.madeOf.set(color, surface);
  }
  material(color: THREE.ColorRepresentation) {
    const key = String(color);
    if (!this.materials.has(key)) {
      const surface = typeof color === "number" ? this.madeOf.get(color) : undefined;
      const look = this.surfaces.look(surface);
      const material = new THREE.MeshStandardMaterial({ color, roughness: look.roughness, metalness: look.metalness ?? 0 });
      material.userData.surface = surface;
      this.surfaces.dress(material, surface);
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }
  /** A painted ground layout whose lawns, pavements and roads become scanned grass, paving and asphalt. */
  ground(layout: THREE.Texture, mask: HTMLCanvasElement, key: string) {
    const maskTexture = new THREE.CanvasTexture(mask);
    maskTexture.colorSpace = THREE.NoColorSpace;
    this.textures.push(maskTexture);
    const material = new THREE.MeshStandardMaterial({ map: layout, roughness: 0.9 });
    material.userData.groundMask = maskTexture;
    this.surfaces.dressGround(material, maskTexture);
    this.materials.set(key, material);
    return material;
  }
  /** Loads the scans, then dresses every material made so far (later ones are dressed as they are made). */
  async loadSurfaces(anisotropy: number) {
    await this.surfaces.load(anisotropy);
    this.materials.forEach((material) => {
      if (material.userData.surface && !material.map) this.surfaces.dress(material, material.userData.surface);
      if (material.userData.groundMask) this.surfaces.dressGround(material, material.userData.groundMask);
    });
  }
  box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: THREE.ColorRepresentation,
  ) {
    const mesh = new THREE.Mesh(this.unitBox, this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  ball(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.ColorRepresentation,
  ) {
    const mesh = new THREE.Mesh(this.sphere, this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  cylinder(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    color: number,
    top = r,
    sides = 10,
  ) {
    const key = `cylinder-${r}-${top}-${h}-${sides}`;
    let geo = this.geometries.find((g) => g.name === key);
    if (!geo) {
      geo = this.geometry(new THREE.CylinderGeometry(top, r, h, sides));
      geo.name = key;
    }
    const mesh = new THREE.Mesh(geo, this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  sign(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    bg = "#f7efda",
    fg = "#344b51",
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 108);
    ctx.fillStyle = fg;
    ctx.font = "bold 44px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68, 458);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    this.materials.set(`sign-${this.materials.size}`, material);
    // Signboards are lit at night, so the street stays readable after dark.
    this.glow(material, 0xffffff, 0.06, 0.85);
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(w, h)),
      material,
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  dispose() {
    this.surfaces.dispose();
    this.materials.forEach((m) => m.dispose());
    this.blob?.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.forEach((g) => g.dispose());
  }
}
