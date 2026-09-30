import * as THREE from "three";
import { BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import type { QualityPreset } from "./quality";

// The frame, in HDR: scene -> ambient occlusion (grounds buildings, trees and people) -> the conversation depth
// blur -> bloom (lit windows, lamps, signs at night) -> neutral PBR tone mapping (true-to-material colours) -> a light vignette.

const inkShader = /* glsl */ `
  uniform float focusDistance;
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    vec3 color = inputColor.rgb;
    float center = -getViewZ(depth);
    // In conversations, whatever is far from the speakers softens a little.
    if (focusDistance > 0.) {
      float radius = clamp((abs(center - focusDistance) - 2.2) * .7, 0., 3.);
      vec2 blur = texelSize * radius;
      vec3 softened = texture2D(inputBuffer, uv + vec2(blur.x, blur.y)).rgb + texture2D(inputBuffer, uv + vec2(-blur.x, blur.y)).rgb
        + texture2D(inputBuffer, uv + vec2(blur.x, -blur.y)).rgb + texture2D(inputBuffer, uv - blur).rgb;
      color = (color * 2. + softened) / 6.;
    }
    outputColor = vec4(color, inputColor.a);
  }`;

class InkEffect extends Effect {
  constructor() {
    super("InkEffect", inkShader, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map([["focusDistance", new THREE.Uniform(0)]]),
    });
  }
  set focusDistance(value: number) {
    this.uniforms.get("focusDistance")!.value = value;
  }
}

export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly ink = new InkEffect();
  private readonly bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1, luminanceSmoothing: 0.2, intensity: 0.4, radius: 0.72 });
  private readonly ao: N8AOPostPass | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityPreset, width: number, height: number) {
    // Tone mapping happens at the end of the stack, on HDR values, so bright lights can bloom.
    renderer.toneMapping = THREE.NoToneMapping;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: quality.msaa });
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality.ao) {
      const ao = new N8AOPostPass(scene, camera, width, height);
      Object.assign(ao.configuration, {
        aoRadius: 2.4, distanceFalloff: 1, intensity: 2.2, halfRes: quality.aoHalfRes,
        // Bounce light in a sunny town is bluish: AO tinted towards the sky reads as shade, not dirt.
        color: new THREE.Color(0x1d2838), gammaCorrection: false,
      });
      ao.setQualityMode(quality.aoMode);
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.composer.addPass(new EffectPass(camera, this.ink));
    this.composer.addPass(new EffectPass(camera, this.bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      new VignetteEffect({ offset: 0.35, darkness: 0.28 })));
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height, false);
  }

  /** Night makes lights glow more; `focusDistance` > 0 softens what's far from a conversation. */
  render(dt: number, night: number, focusDistance = 0) {
    this.ink.focusDistance = focusDistance;
    this.bloom.intensity = 0.35 + night * 0.9;
    this.bloom.luminanceMaterial.threshold = 1 - night * 0.35;
    if (this.ao) this.ao.configuration.intensity = 2.2 - night * 0.8;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
