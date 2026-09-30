import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Human, validHumanAsset, type HumanPose } from "../src/game/three/human";

function fixture() {
  const scene = new THREE.Group();
  scene.position.set(10, 2, 8);
  scene.rotation.y = 0.7;
  const skin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.3), new THREE.MeshStandardMaterial());
  skin.position.y = 1;
  scene.add(skin);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshStandardMaterial({ name: "hide_helper" }));
  scene.add(hidden);
  for (const name of ["pelvis", "spine_03", "neck_01", "head", "thigh_l", "thigh_r", "calf_l", "calf_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r"]) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(name.endsWith("_l") ? 0.2 : -0.2, name.startsWith("lowerarm") ? 1 : 1.3, 0);
    scene.add(bone);
  }
  const lashes = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshStandardMaterial());
  lashes.position.y = 1.5;
  lashes.morphTargetDictionary = { eyeBlinkLeft: 0, eyeBlinkRight: 1 };
  lashes.morphTargetInfluences = [0, 0];
  scene.add(lashes);
  return { gltf: { scene } as unknown as GLTF, skin, hidden, lashes };
}
const pose: HumanPose = { legs:[0.4,-0.4], arms:[[0,0],[0,0]], head:{yaw:0.2,pitch:0,tilt:0}, lean:{x:0,z:0}, blink:1, voice:0.5, emotion:"happy" };

test("MetaHuman is centered, grounded and normalized without hidden export geometry", () => {
  const f = fixture(), orientation = f.gltf.scene.quaternion.clone();
  const human = new Human(f.gltf);
  assert.ok(human.animated);
  assert.ok(f.gltf.scene.quaternion.equals(orientation), "preserve export root rotation");
  const box = new THREE.Box3().setFromObject(f.skin);
  assert.ok(Math.abs(box.min.y) < 0.00001);
  assert.ok(Math.abs(box.max.y - 1.55) < 0.00001);
  assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).x) < 0.00001);
  assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).z) < 0.00001);
  assert.equal(f.hidden.visible, false);
  human.dispose();
});

test("separate lash meshes blink even without a jawOpen morph", () => {
  const f = fixture(), human = new Human(f.gltf);
  human.pose(pose, 1 / 30);
  assert.deepEqual(f.lashes.morphTargetInfluences, [1,1]);
  assert.ok(f.gltf.scene.getObjectByName("calf_r")!.quaternion.toArray().every(Number.isFinite));
  human.dispose();
});

test("incomplete rigs retain the procedural fallback", () => {
  const f = fixture();
  f.gltf.scene.getObjectByName("calf_r")!.removeFromParent();
  const human = new Human(f.gltf);
  assert.equal(human.animated, false);
  human.dispose();
});

test("exported alpha-mask hair enables coverage smoothing without transparency sorting", () => {
  const f = fixture();
  const material = new THREE.MeshStandardMaterial({ name:"hair_Ren", alphaTest:0.5 });
  const hair = new THREE.Mesh(new THREE.PlaneGeometry(0.1,0.1), material);
  f.gltf.scene.add(hair);
  const human = new Human(f.gltf);
  assert.equal(material.alphaToCoverage, true);
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
  human.dispose();
});

test("character manifests accept only local GLBs and finite facing corrections", () => {
  assert.ok(validHumanAsset({file:"cit_009.glb", facingDegrees:90}));
  for (const file of ["../secret.glb", "https://other/model.glb", "model.gltf", "bad.glb?token=x"]) assert.equal(validHumanAsset({file}),false);
  assert.equal(validHumanAsset({file:"a.glb", facingDegrees:NaN}),false);
});
