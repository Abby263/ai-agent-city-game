import * as THREE from "three";
import { THEME } from "./theme";

// Photo-scanned surfaces (Poly Haven, CC0) mapped by world position, so every box gets true-scale texture
// without UVs of its own. "photo" surfaces look like the scan; "tint" surfaces keep their art-directed colour
// and borrow only the scan's grain and relief.

export type Surface = "asphalt" | "paving" | "grass" | "plaster" | "roof" | "wood" | "glass" | "water" | "metal" | "foliage";
type Scanned = "asphalt" | "paving" | "grass" | "plaster" | "roof" | "wood";
const SCANNED: Scanned[] = ["asphalt", "paving", "grass", "plaster", "roof", "wood"];

type Look = { roughness: number; metalness?: number; tile?: number; grain?: number; relief?: number; photo?: boolean };
const LOOK: Record<Surface, Look> = {
  // One town unit is about 2.6 m (a two-storey house is 2.5 units tall); each scan covers about 2 m.
  asphalt: { roughness: 1, tile: 0.9, relief: 0.7, photo: true },
  paving: { roughness: 1, tile: 0.7, relief: 0.6, photo: true },
  grass: { roughness: 1, tile: 0.6, grain: 0.75, relief: 0.8 },
  plaster: { roughness: 1, tile: 0.7, grain: 0.5, relief: 0.45 },
  roof: { roughness: 1, tile: 0.45, grain: 0.85, relief: 0.9 },
  wood: { roughness: 1, tile: 0.4, grain: 0.9, relief: 0.6 },
  // Window glass: mostly the sky and street reflected in it, with a dark interior behind.
  glass: { roughness: 0.04, metalness: 0.75 },
  water: { roughness: 0.06, metalness: 0.1 },
  metal: { roughness: 0.4, metalness: 0.75 },
  // Leaf canopies borrow the leafy ground scan at a small scale, for clumps of leaves instead of smooth plastic.
  foliage: { roughness: 0.9, tile: 0.3, grain: 0.95, relief: 1.3 },
};
// What an unlabelled box is made of: painted, slightly worn material.
const DEFAULT_LOOK: Look = { roughness: 0.78 };

type Scan = { color: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture; mean: number };

/** Average brightness of a photo, so "tint" surfaces keep their colour's brightness on average. */
function meanLuminance(image: HTMLImageElement | ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  const linear = (v: number) => Math.pow(v / 255, 2.2);
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2]);
  return Math.max(0.02, sum / (data.length / 4));
}

export class SurfaceLibrary {
  private readonly scans = new Map<Scanned, Scan>();
  private loading?: Promise<void>;

  look(surface: Surface | undefined) {
    return surface ? LOOK[surface] : DEFAULT_LOOK;
  }

  scan(surface: Surface | undefined) {
    if (surface === "foliage") return this.scans.get("grass");
    return surface && (SCANNED as string[]).includes(surface) ? this.scans.get(surface as Scanned) : undefined;
  }

  load(anisotropy: number) {
    this.loading ??= Promise.all(SCANNED.map(async (name) => {
      const loader = new THREE.TextureLoader();
      const [color, normal, rough] = await Promise.all(
        ["color", "normal", "rough"].map((map) => loader.loadAsync(`/art/surfaces/${name}/${map}.jpg`)),
      );
      for (const texture of [color, normal, rough]) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = anisotropy;
      }
      color.colorSpace = THREE.SRGBColorSpace;
      this.scans.set(name, { color, normal, rough, mean: meanLuminance(color.image) });
    })).then(() => undefined);
    return this.loading;
  }

  /** Gives a material its scan, mapped by world position. Recompiles once. */
  dress(material: THREE.MeshStandardMaterial, surface: Surface | undefined) {
    const scan = this.scan(surface), look = this.look(surface);
    if (!scan) return;
    const photo = Boolean(look.photo);
    material.map = scan.color;
    material.normalMap = scan.normal;
    material.normalScale.setScalar(look.relief ?? 0.6);
    material.roughnessMap = scan.rough;
    if (photo) material.color.set(0xffffff);
    const uniforms = { uSurfaceTile: { value: look.tile ?? 1.5 }, uSurfaceMean: { value: scan.mean }, uSurfaceGrain: { value: look.grain ?? 0.6 } };
    material.customProgramCacheKey = () => `agentcity-surface-${photo ? "photo" : "tint"}`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uSurfaceTile;")
        .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
          {
            mat4 surfPlaced = modelMatrix;
            #ifdef USE_INSTANCING
              surfPlaced = modelMatrix * instanceMatrix;
            #endif
            vec3 surfPos = (surfPlaced * vec4(transformed, 1.)).xyz;
            vec3 surfN = abs(normalize(mat3(surfPlaced) * objectNormal));
            vec2 surfUv = surfN.y > max(surfN.x, surfN.z) ? surfPos.xz : (surfN.x > surfN.z ? surfPos.zy : surfPos.xy);
            surfUv /= uSurfaceTile;
            vMapUv = surfUv;
            vNormalMapUv = surfUv;
            vRoughnessMapUv = surfUv;
          }`);
      if (!photo)
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float uSurfaceMean; uniform float uSurfaceGrain;")
          .replace("#include <map_fragment>", `
            vec3 surfTex = texture2D(map, vMapUv).rgb;
            float surfLum = dot(surfTex, vec3(.2126, .7152, .0722)) / uSurfaceMean;
            diffuseColor.rgb *= mix(vec3(1.), vec3(surfLum), uSurfaceGrain);`);
    };
    material.needsUpdate = true;
  }

  /**
   * Ground painted as a layout (roads, pavements, lawns, markings) plus a mask of what each spot is made of:
   * red asphalt, green paving, blue grass, black = keep the painted colour (markings, crossings).
   */
  dressGround(material: THREE.MeshStandardMaterial, mask: THREE.Texture) {
    const asphalt = this.scans.get("asphalt"), paving = this.scans.get("paving"), grass = this.scans.get("grass");
    if (!asphalt || !paving || !grass) return;
    const uniforms = {
      uGroundMask: { value: mask }, uAsphalt: { value: asphalt.color }, uPaving: { value: paving.color }, uGrass: { value: grass.color },
      uGrassMean: { value: grass.mean },
    };
    material.customProgramCacheKey = () => "agentcity-ground";
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vGroundWorld;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform sampler2D uGroundMask; uniform sampler2D uAsphalt; uniform sampler2D uPaving; uniform sampler2D uGrass; uniform float uGrassMean;
          varying vec2 vGroundWorld;`)
        .replace("#include <map_fragment>", `
          vec3 groundLayout = texture2D(map, vMapUv).rgb;
          vec3 groundMask = texture2D(uGroundMask, vMapUv).rgb;
          float groundSum = groundMask.r + groundMask.g + groundMask.b;
          // Lawns keep the layout's green (no scan is a lush lawn); the scan adds blades, clumps and soil.
          float grassGrain = dot(texture2D(uGrass, vGroundWorld / ${LOOK.grass.tile!.toFixed(2)}).rgb, vec3(.2126, .7152, .0722)) / uGrassMean;
          vec3 lawn = groundLayout * vec3(${THEME.ground.tint.map((v) => v.toFixed(2)).join(", ")}) * mix(1., grassGrain, ${LOOK.grass.grain!.toFixed(2)});
          vec3 groundScan = (texture2D(uAsphalt, vGroundWorld / ${LOOK.asphalt.tile!.toFixed(2)}).rgb * groundMask.r
            + texture2D(uPaving, vGroundWorld / ${LOOK.paving.tile!.toFixed(2)}).rgb * groundMask.g
            + lawn * groundMask.b) / max(groundSum, 1e-3);
          float groundPaint = 1. - clamp(groundSum, 0., 1.);
          diffuseColor.rgb *= mix(groundScan, groundLayout, groundPaint);`)
        .replace("#include <roughnessmap_fragment>", `
          float roughnessFactor = mix((groundMask.r * .9 + groundMask.g * .82 + groundMask.b * .97) / max(groundSum, 1e-3), .6, groundPaint);`);
    };
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  dispose() {
    this.scans.forEach((scan) => [scan.color, scan.normal, scan.rough].forEach((t) => t.dispose()));
  }
}

/** What the ground layout's colours are made of; anything else (markings, crossings) stays painted. */
export const GROUND_KINDS: Record<string, keyof typeof MASK> = {
  "#9cbd8b": "grass", "#a8c493": "grass", "#94b480": "grass",
  // Lucknow's open ground is bare earth: it keeps its painted colour and takes the scan's grain, like a lawn does.
  "#c9b48e": "grass", "#d3c09b": "grass", "#bda57d": "grass", "#a9b97f": "grass", "#b5a988": "grass",
  "#6f777c": "asphalt", "#959a98": "asphalt",
  "#e1ddcf": "paving", "#ddd7c8": "paving", "#b9b4a8": "paving", "#c5c6ba": "paving",
  "#899398": "asphalt", "#7b858d": "asphalt",
};

const MASK: Record<string, string> = {
  grass: "#0000ff",
  paving: "#00ff00",
  asphalt: "#ff0000",
  paint: "#000000",
};

/**
 * Paints a ground layout and, alongside it, the half-resolution mask of what each spot is made of.
 * `kinds` maps each layout colour to its material; colours not listed stay painted (markings, crossings).
 */
export function paintedGround(width: number, height: number, kinds: Record<string, keyof typeof MASK>) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = Math.ceil(width / 2);
  maskCanvas.height = Math.ceil(height / 2);
  const layout = canvas.getContext("2d")!;
  const mask = maskCanvas.getContext("2d")!;
  mask.scale(maskCanvas.width / width, maskCanvas.height / height);
  const toMask = (style: unknown) => MASK[kinds[String(style).toLowerCase()] ?? "paint"];
  // Every draw goes to both canvases; colours are translated into materials for the mask.
  const ctx = new Proxy(layout, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        (Reflect.get(mask, prop, mask) as (...a: unknown[]) => unknown).apply(mask, args);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
    set(target, prop, value) {
      Reflect.set(target, prop, value, target);
      Reflect.set(mask, prop, prop === "fillStyle" || prop === "strokeStyle" ? toMask(value) : value, mask);
      return true;
    },
  });
  return { canvas, maskCanvas, ctx };
}
