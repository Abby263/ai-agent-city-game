// Types for the parts of n8ao (ISC) the town uses; the package ships none.
declare module "n8ao" {
  import type { Pass } from "postprocessing";
  import type { Camera, Color, Scene } from "three";
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      color: Color;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
    };
    setQualityMode(mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"): void;
  }
}
