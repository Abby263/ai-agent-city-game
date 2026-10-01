// Replaces EZ-Tree's inlined textures: the few the town uses are served from /art/trees and loaded on demand.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();

function load(url, srgb) {
  if (!cache.has(url)) {
    const texture = loader.load(url);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    cache.set(url, texture);
  }
  return cache.get(url);
}

export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
  const texture = load(`/art/trees/bark/${barkType}_${fileType}.jpg`, fileType === 'color');
  texture.repeat.x = scale.x;
  texture.repeat.y = 1 / scale.y;
  return texture;
}

export function getLeafTexture(leafType) {
  return load(`/art/trees/leaves/${leafType}.png`, true);
}
