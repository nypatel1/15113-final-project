/**
 * poseDetector.js
 * -----------------------------------------------------------------
 * Thin wrapper around MediaPipe's PoseLandmarker (via
 * @mediapipe/tasks-vision) that hides all the WASM/model loading
 * ceremony from the rest of the app.
 *
 * Usage:
 *   const det = await createPoseDetector();
 *   const res = det.detect(videoElement, performance.now());
 *   // res.landmarks: Array<Array<{x,y,z,visibility}>>
 */

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// CDN-hosted task files. Keeping them remote avoids bundling ~10MB of
// wasm + model weights into the dev server.
const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export async function createPoseDetector() {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return {
    detect(video, timestampMs) {
      try {
        return landmarker.detectForVideo(video, timestampMs);
      } catch (e) {
        console.error("Pose detection failed:", e);
        return null;
      }
    },
    close() {
      landmarker.close();
    },
  };
}

/**
 * MediaPipe Pose Landmarker connection pairs used when drawing the skeleton.
 * (Subset of the canonical pose graph — we skip feet to keep the overlay clean.)
 */
export const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Arms
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  // Legs
  [23, 25], [25, 27],
  [24, 26], [26, 28],
];
