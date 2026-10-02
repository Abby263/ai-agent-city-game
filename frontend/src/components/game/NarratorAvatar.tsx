"use client";

import { useEffect, useRef, useState } from "react";
import { setAvatarSpeaker, type Clip } from "@/lib/narrator-kokoro";

/**
 * The narrator in person: a head-and-shoulders avatar (TalkingHead, MIT) that blinks, looks at you, and moves its
 * lips to the natural voice's own mouth-shape timings. Each city has its own (public/avatars, built by
 * scripts/blender/export-residents.py --talking). While it is on screen the narrator's voice plays through it.
 */
export function NarratorAvatar({ city }: { city: string }) {
  const node = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const container = node.current;
    if (!container) return;
    let gone = false;
    let dispose = () => {};
    void (async () => {
      const [{ TalkingHead }, { GLTFLoader }, { MeshoptDecoder }, THREE] = await Promise.all([
        import("@/vendor/talkinghead/talkinghead.mjs"), import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js"), import("three"),
      ]);
      if (gone) return;
      // TalkingHead's body poses are written for another skeleton's resting pose and twist ours, so the body is
      // held as it was built and only the head moves: a slow sway, and small nods while it speaks. The face (lips,
      // blinks, glances, expressions) is all TalkingHead's.
      type Rest = { bone: import("three").Object3D; quaternion: import("three").Quaternion; position: import("three").Vector3 };
      let rest: Rest[] = [], skull: Rest | undefined, clock = 0, voice = 0, framed = false;
      const nod = new THREE.Quaternion(), turn = new THREE.Euler(), at = new THREE.Vector3();
      const hold = (dt: number) => {
        clock += dt / 1000;
        for (const { bone, quaternion, position } of rest) { bone.quaternion.copy(quaternion); bone.position.copy(position); }
        if (!skull) return;
        if (!framed) {
          // TalkingHead aims its head shot by its own idea of the avatar's height; aim at where this head really is.
          framed = true;
          skull.bone.updateWorldMatrix(true, false);
          const face = at.setFromMatrixPosition(skull.bone.matrixWorld).y + 0.1, distance = 2.3;
          head.setView("head", { cameraDistance: distance - 2, cameraY: 1 - (face - 0.8 * head.avatarHeight) / (Math.tan(THREE.MathUtils.degToRad(5)) * distance) });
        }
        voice += ((head.isSpeaking ? 1 : 0) - voice) * Math.min(1, dt / 250);
        turn.set(
          Math.sin(clock * 0.6) * 0.012 + voice * Math.sin(clock * 3.1) * 0.03,
          Math.sin(clock * 0.37) * 0.05 + voice * Math.sin(clock * 1.7) * 0.035,
          Math.sin(clock * 0.23) * 0.015,
        );
        skull.bone.quaternion.multiply(nod.setFromEuler(turn));
      };
      const head: InstanceType<typeof TalkingHead> = new TalkingHead(container, {
        update: hold,
        // The voice and its mouth shapes come from HeadTTS, so TalkingHead needs neither a speech service nor its
        // own text-to-lips modules.
        ttsEndpoint: "", lipsyncModules: [], lipsyncLang: "en", cameraView: "head", cameraRotateEnable: false,
        modelPixelRatio: Math.min(2, window.devicePixelRatio || 1), modelFPS: 30,
        lightAmbientIntensity: 0.7, lightDirectIntensity: 3.5, lightDirectColor: 0xfff1dc,
        avatarIdleEyeContact: 0.5, avatarSpeakingEyeContact: 0.8,
      });
      dispose = () => { rest = []; setAvatarSpeaker(null); try { head.stopSpeaking(); head.stop(); head.dispose(); } catch { /* already gone */ } container.replaceChildren(); };
      // TalkingHead's loader does not know meshopt compression, which our avatars use: teach it for this one load.
      const loadAsync = GLTFLoader.prototype.loadAsync;
      GLTFLoader.prototype.loadAsync = function (this: InstanceType<typeof GLTFLoader>, url: string, onProgress?: (event: ProgressEvent) => void) {
        this.setMeshoptDecoder(MeshoptDecoder);
        return loadAsync.call(this, url, onProgress).then((gltf) => {
          // The resting pose, noted before TalkingHead poses anything.
          (gltf as { scene: import("three").Object3D }).scene.traverse((object) => {
            if (!(object as import("three").Bone).isBone) return;
            const entry: Rest = { bone: object, quaternion: object.quaternion.clone(), position: object.position.clone() };
            rest.push(entry);
            if (object.name === "Head") skull = entry;
          });
          return gltf;
        });
      } as typeof loadAsync;
      try {
        await head.showAvatar({ url: `/avatars/narrator_${city}.glb`, body: "F", avatarMood: "happy", lipsyncLang: "en" });
      } finally {
        GLTFLoader.prototype.loadAsync = loadAsync;
      }
      if (gone) return dispose();
      if (process.env.NODE_ENV === "development") Object.assign(window, { __head: head });
      setAvatarSpeaker({
        play: (clip: Clip) => new Promise((resolve) => {
          try {
            head.speakAudio(clip, { isRaw: true });
          } catch { return resolve(false); }
          // TalkingHead has no "finished" callback: watch for it to fall quiet, with the clip's length as a stop.
          const began = performance.now(), limit = clip.audio.duration * 1000 + 1500;
          const watch = window.setInterval(() => {
            const elapsed = performance.now() - began;
            if ((elapsed > 250 && !head.isSpeaking && !head.isAudioPlaying) || elapsed > limit || gone) { window.clearInterval(watch); resolve(true); }
          }, 60);
        }),
        stop: () => head.stopSpeaking(),
      });
      setShown(true);
    })().catch((error) => { console.warn("The narrator's avatar could not be shown:", error); if (!gone) dispose(); });
    return () => { gone = true; dispose(); };
  }, [city]);
  return <div className="narrator-avatar" ref={node} data-shown={shown} aria-hidden="true" />;
}
