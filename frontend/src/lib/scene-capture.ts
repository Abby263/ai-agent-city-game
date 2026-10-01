// The 3D town registers a way to grab the current frame, so a scene can be shared as a picture.

let capture: (() => string | null) | null = null;

export function registerSceneCapture(fn: (() => string | null) | null) {
  capture = fn;
}

/** The town as it looks right now (a JPEG data URL), or null if it can't be captured. */
export function captureScene() {
  try {
    return capture?.() ?? null;
  } catch {
    return null;
  }
}
