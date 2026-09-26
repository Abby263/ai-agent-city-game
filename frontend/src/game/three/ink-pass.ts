import * as THREE from "three";

/** Depth curvature ink keeps flat roads quiet while outlining silhouettes and roof creases. */
export class InkPass {
  private target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private geometry = new THREE.PlaneGeometry(2, 2);
  constructor(camera: THREE.PerspectiveCamera) {
    this.target.samples = 2;
    this.target.depthTexture = new THREE.DepthTexture(
      1,
      1,
      THREE.UnsignedIntType,
    );
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        sceneColor: { value: this.target.texture },
        sceneDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        near: { value: camera.near },
        far: { value: camera.far },
        focusDistance: { value: 0 },
      },
      vertexShader: `varying vec2 uvScreen; void main() { uvScreen = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: `
        uniform sampler2D sceneColor; uniform sampler2D sceneDepth;
        uniform vec2 texel; uniform float near; uniform float far; uniform float focusDistance;
        varying vec2 uvScreen;
        float distanceAt(vec2 uv) {
          float depth = texture2D(sceneDepth, uv).r;
          return near * far / (far - depth * (far - near));
        }
        void main() {
          vec3 color = texture2D(sceneColor, uvScreen).rgb;
          float center = distanceAt(uvScreen);
          if (focusDistance > 0.) {
            float radius = clamp((abs(center - focusDistance) - 2.2) * .7, 0., 3.);
            vec2 blur = texel * radius;
            vec3 softened = texture2D(sceneColor, uvScreen + vec2(blur.x, blur.y)).rgb
              + texture2D(sceneColor, uvScreen + vec2(-blur.x, blur.y)).rgb
              + texture2D(sceneColor, uvScreen + vec2(blur.x, -blur.y)).rgb
              + texture2D(sceneColor, uvScreen - blur).rgb;
            color = (color * 2. + softened) / 6.;
          }
          float curvature = abs(distanceAt(uvScreen + vec2(texel.x, 0.)) + distanceAt(uvScreen - vec2(texel.x, 0.)) - 2. * center)
            + abs(distanceAt(uvScreen + vec2(0., texel.y)) + distanceAt(uvScreen - vec2(0., texel.y)) - 2. * center);
          float ink = smoothstep(.05, .35, curvature) * (1. - smoothstep(35., 90., center));
          if (center > far * .95) ink = 0.;
          color *= mix(vec3(1.), vec3(.46, .52, .61), ink * .52);
          float grey = dot(color, vec3(.2126, .7152, .0722));
          color = mix(vec3(grey), color, 1.08);
          gl_FragColor = vec4(color, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
  }
  resize(width: number, height: number) {
    this.target.setSize(width, height);
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
  }
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    focusDistance = 0,
  ) {
    this.material.uniforms.focusDistance.value = focusDistance;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
