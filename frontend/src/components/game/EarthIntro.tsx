"use client";

import { useEffect, useRef } from "react";
import { activeCity } from "@/lib/cities";

// The opening shot: Earth from space turns to Japan, dives towards Tokyo, passes through the clouds and lands on
// Nakameguro, where the town camera finishes the descent. Earth imagery: NASA Blue Marble (public domain).

// Where the flight lands and what it names on the way down come from the city being played.
// The planet needs no label; captions start once there is somewhere to name.
const NAKAMEGURO = activeCity().coords;
const CAPTIONS = activeCity().flight;
/** Seconds: the globe turns and zooms until DIVE_END, the clouds close in, the town descends behind them, then fade. */
const DIVE_END = 5.6, CLOUD_IN = 5.0, DESCEND_AT = 5.4, FADE_START = 6.2, FADE_END = 7.2;

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export function EarthIntro({ townReady, onDescend, onDone }: { townReady: boolean; onDescend: () => void; onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  // Captions, clouds and the final fade are driven straight from the animation frame, not React state.
  const root = useRef<HTMLDivElement>(null);
  const captionEl = useRef<HTMLParagraphElement>(null);
  const cloudEl = useRef<HTMLDivElement>(null);
  const latest = useRef({ townReady, onDescend, onDone });
  useEffect(() => {
    latest.current = { townReady, onDescend, onDone };
  }, [townReady, onDescend, onDone]);
  const finished = useRef(false);
  const descended = useRef(false);

  useEffect(() => {
    let frame = 0, disposed = false;
    let cleanup = () => {};
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      if (!descended.current) { descended.current = true; latest.current.onDescend(); }
      latest.current.onDone();
    };
    (async () => {
      const THREE = await import("three");
      if (disposed || !host.current) return;
      const width = host.current.clientWidth, height = host.current.clientHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.current.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x02040a);
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.001, 200);

      // Stars.
      const stars = new Float32Array(2400 * 3);
      for (let i = 0; i < stars.length; i += 3) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(60 + Math.random() * 40);
        stars.set([v.x, v.y, v.z], i);
      }
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
      const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.85 });
      scene.add(new THREE.Points(starGeometry, starMaterial));

      // Earth, lit by the sun from the upper left so Japan is in daylight, and its blue atmosphere.
      const globe = new THREE.Group();
      scene.add(globe);
      // The flight starts at once on a plain blue planet; the photograph lands on it as soon as it has loaded.
      const earthGeometry = new THREE.SphereGeometry(1, 128, 64);
      const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x2a5d8f, shininess: 12, specular: 0x333844 });
      globe.add(new THREE.Mesh(earthGeometry, earthMaterial));
      let texture: import("three").Texture | null = null;
      new THREE.TextureLoader().load("/art/earth/earth.jpg", (loaded) => {
        if (disposed) return loaded.dispose();
        texture = loaded;
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthMaterial.map = loaded;
        earthMaterial.color.set(0xffffff);
        earthMaterial.needsUpdate = true;
      });
      const glowGeometry = new THREE.SphereGeometry(1.04, 64, 32);
      const glowMaterial = new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        vertexShader: "varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
        fragmentShader: "varying vec3 vNormal; void main() { float rim = pow(0.72 - dot(vNormal, vec3(0., 0., 1.)), 3.); gl_FragColor = vec4(0.35, 0.62, 1.0, 1.) * rim * 1.6; }",
      });
      scene.add(new THREE.Mesh(glowGeometry, glowMaterial));
      const sun = new THREE.DirectionalLight(0xffffff, 2.6);
      sun.position.set(-2.5, 1.6, 3.2);
      scene.add(sun, new THREE.AmbientLight(0x9fb4d8, 0.35));

      // Rotations that bring Nakameguro to face the camera (+z) with north up: a turn about y, then a tilt about x.
      const phi = ((NAKAMEGURO.lon + 180) * Math.PI) / 180;
      const lat = (NAKAMEGURO.lat * Math.PI) / 180;
      const end = { x: lat, y: Math.PI / 2 - phi };
      const start = { x: lat * 0.35, y: end.y + 1.5 };

      const began = performance.now();
      const tick = () => {
        if (disposed) return;
        frame = requestAnimationFrame(tick);
        const t = (performance.now() - began) / 1000;
        const turn = span(t, 0.4, 3.1);
        globe.rotation.set(start.x + (end.x - start.x) * turn, start.y + (end.y - start.y) * turn, 0, "XYZ");
        // From the whole planet, to Japan filling the view, to low orbit over Tokyo.
        const zoom = t < 3.6 ? 4.2 + (1.9 - 4.2) * span(t, 1.2, 3.6) : 1.9 + (1.045 - 1.9) * span(t, 3.6, DIVE_END);
        camera.position.set(0, 0, zoom);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        const caption = CAPTIONS.filter(([at]) => t >= at).at(-1)![1];
        if (captionEl.current && captionEl.current.textContent !== caption) {
          captionEl.current.textContent = caption;
          captionEl.current.classList.remove("earth-intro-caption-in");
          void captionEl.current.offsetWidth;
          captionEl.current.classList.add("earth-intro-caption-in");
        }
        if (cloudEl.current) cloudEl.current.style.opacity = String(span(t, CLOUD_IN, DESCEND_AT + 0.4));
        // The town takes over behind the clouds, once it has loaded.
        if (t >= DESCEND_AT && !descended.current && latest.current.townReady) {
          descended.current = true;
          latest.current.onDescend();
        }
        const fadeFrom = descended.current ? FADE_START : Infinity;
        if (root.current) root.current.style.opacity = String(1 - span(t, fadeFrom, FADE_END));
        if (t >= FADE_END && descended.current) finish();
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(frame);
        renderer.dispose();
        [starGeometry, starMaterial, earthGeometry, earthMaterial, glowGeometry, glowMaterial].forEach((r) => r.dispose());
        texture?.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, []);

  const skip = () => {
    if (!descended.current) { descended.current = true; latest.current.onDescend(); }
    finished.current = true;
    latest.current.onDone();
  };
  return (
    <div ref={root} className="earth-intro" aria-label={`Flying in to ${activeCity().name}`}>
      <div ref={host} className="earth-intro-canvas" />
      <div ref={cloudEl} className="earth-intro-clouds" style={{ opacity: 0 }} />
      <p ref={captionEl} className="earth-intro-caption" />
      <button className="earth-intro-skip" onClick={skip}>Skip</button>
    </div>
  );
}
