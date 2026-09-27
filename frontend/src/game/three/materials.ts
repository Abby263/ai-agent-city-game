import * as THREE from "three";

// Shared geometry and material ownership makes both draw-call batching and teardown explicit.
export class Art {
  readonly materials = new Map<string, THREE.MeshToonMaterial>();
  readonly textures: THREE.Texture[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly unitBox = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  readonly sphere = this.geometry(new THREE.IcosahedronGeometry(1, 1));
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
  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
  material(color: THREE.ColorRepresentation) {
    const key = String(color);
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshToonMaterial({ color, gradientMap: this.ramp }),
      );
    return this.materials.get(key)!;
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
    const material = new THREE.MeshToonMaterial({
      map: texture,
      gradientMap: this.ramp,
    });
    this.materials.set(`sign-${this.materials.size}`, material);
    const mesh = new THREE.Mesh(
      this.geometry(new THREE.PlaneGeometry(w, h)),
      material,
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.blob?.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.forEach((g) => g.dispose());
  }
}
