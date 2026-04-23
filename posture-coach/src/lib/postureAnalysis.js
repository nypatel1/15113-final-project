/**
 * postureAnalysis.js
 * -------------------------------------------------------------
 * Core posture analysis engine.
 *
 * This module is intentionally the most "readable" piece of the app –
 * everything else (webcam, ML, UI) is plumbing. The job here is:
 *
 *   1. Take the raw 33 body landmarks produced by MediaPipe Pose
 *      Landmarker (each is {x, y, z, visibility} in normalized image
 *      coordinates where +y points DOWN).
 *   2. Turn them into a small set of human-readable posture metrics.
 *   3. Combine those metrics into a single 0-100 posture score and a
 *      list of actionable feedback messages.
 *
 * Metrics produced:
 *   - neckTilt        : forward-head angle (deg). 0 ≈ ear directly
 *                       above shoulder, positive ≈ head pushed forward.
 *   - headPitch       : vertical offset of the nose below the ear line,
 *                       normalised by ear distance. Larger ≈ chin tucked
 *                       down, smaller/negative ≈ chin lifted. This is
 *                       what catches "head nodded forward onto chest".
 *   - shoulderTilt    : roll of the shoulder line vs. horizontal (deg).
 *                       0 ≈ shoulders level.
 *   - shoulderHunch   : ear→shoulder distance normalised by shoulder
 *                       width. Smaller = shoulders shrugged up. Only
 *                       *compression* vs baseline is penalised at
 *                       scoring time – a longer neck than baseline just
 *                       means the user relaxed, which is a good thing.
 *   - spineLean       : tilt of the torso (hip→shoulder) vs. vertical.
 *   - symmetry        : 0..1, 1 = perfectly symmetric left/right heights.
 *
 * The scoring function is deliberately simple and tweakable – every
 * metric has a "good" range and a "bad" range and is mapped to a 0..100
 * sub-score via a smooth penalty curve. Weights combine sub-scores into
 * the final value so you can easily re-prioritise what matters.
 *
 * MediaPipe Pose Landmarker indices (the ones we care about):
 *   0  = nose          7  = left ear      8  = right ear
 *   9  = mouth left    10 = mouth right
 *   11 = left shoulder 12 = right shoulder
 *   23 = left hip      24 = right hip
 * -------------------------------------------------------------
 */

export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
};

// ---------- small vector helpers ---------------------------------

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Angle of a vector measured from the image's vertical axis (up).
 * Because image-y grows downward, "up" is -y. A perfectly vertical
 * vector pointing from shoulders to ears yields 0°. A vector tilted
 * forward (ears ahead of shoulders, +x) yields a positive angle.
 */
function angleFromVertical(vec) {
  // vec points "up" from shoulder to ear, so flip y for math-friendly up.
  return toDeg(Math.atan2(vec.x, -vec.y));
}

/** Angle of a vector from the horizontal axis (+x). Used for shoulder roll. */
function angleFromHorizontal(vec) {
  return toDeg(Math.atan2(vec.y, vec.x));
}

// ---------- landmark quality check -------------------------------

/**
 * Every landmark carries a `visibility` score. If any of the joints we
 * rely on are below this threshold we refuse to produce a score so the
 * UI can show "step into frame" instead of lying.
 */
const MIN_VIS = 0.5;
const REQUIRED_LANDMARKS = [
  LM.LEFT_EAR,
  LM.RIGHT_EAR,
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
];

export function hasEnoughLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 25) return false;
  return REQUIRED_LANDMARKS.every(
    (i) => (landmarks[i]?.visibility ?? 0) >= MIN_VIS,
  );
}

// ---------- raw metrics -----------------------------------------

/**
 * Compute geometric metrics from landmarks. Hip data is optional (seated
 * users often have hips occluded by the desk), so spineLean becomes null
 * when hips aren't confidently visible.
 */
export function computeMetrics(landmarks) {
  const nose = landmarks[LM.NOSE];
  const mouthL = landmarks[LM.MOUTH_LEFT];
  const mouthR = landmarks[LM.MOUTH_RIGHT];
  const lEar = landmarks[LM.LEFT_EAR];
  const rEar = landmarks[LM.RIGHT_EAR];
  const lSh = landmarks[LM.LEFT_SHOULDER];
  const rSh = landmarks[LM.RIGHT_SHOULDER];
  const lHip = landmarks[LM.LEFT_HIP];
  const rHip = landmarks[LM.RIGHT_HIP];

  const earMid = mid(lEar, rEar);
  const shMid = mid(lSh, rSh);

  const shoulderWidth = Math.max(len(sub(lSh, rSh)), 1e-6);
  const earDistance = Math.max(len(sub(lEar, rEar)), 1e-6);

  // Vector from shoulder midpoint to ear midpoint.
  const neckVec = sub(earMid, shMid);
  const neckTilt = angleFromVertical(neckVec);

  // --- Head pitch (NEW) --------------------------------------------
  // When you look straight ahead the nose sits slightly below the line
  // between the ears (~0.3 of ear distance). When you nod your head
  // down, the chin goes toward the chest and the nose drops further
  // below the ear line, so this ratio grows. When you lift your chin
  // it shrinks or even goes negative.
  //
  // Importantly this is independent of forward-head drift: if your
  // whole head slides forward (ears+nose translate together) the nose
  // still sits at the same vertical offset below the ear line.
  // Normalising by ear-distance keeps the ratio scale-invariant, so
  // the metric survives zooming in/out from the camera.
  //
  // The nose is the most reliably tracked face landmark in Pose
  // Landmarker. We fall back to the mouth midpoint only if the nose
  // is occluded (e.g. resting a hand on the face).
  let headPitchAxis = null;
  if ((nose?.visibility ?? 0) >= MIN_VIS) {
    headPitchAxis = sub(nose, earMid);
  } else if (
    (mouthL?.visibility ?? 0) >= MIN_VIS &&
    (mouthR?.visibility ?? 0) >= MIN_VIS
  ) {
    headPitchAxis = sub(mid(mouthL, mouthR), earMid);
  }
  const headPitch =
    headPitchAxis == null ? null : headPitchAxis.y / earDistance;

  // Shoulder roll: line from left to right shoulder vs. horizontal.
  const shVec = sub(rSh, lSh);
  // Use absolute small tilt regardless of which shoulder is higher.
  let shoulderTilt = angleFromHorizontal(shVec);
  if (shoulderTilt > 90) shoulderTilt -= 180;
  if (shoulderTilt < -90) shoulderTilt += 180;

  // Shoulder hunch: how tall is the neck compared to shoulder width.
  // A relaxed neck is roughly 35–55% of shoulder width tall.
  const neckLength = len(neckVec);
  const shoulderHunch = neckLength / shoulderWidth; // bigger = longer neck

  // Symmetry: compare vertical heights of paired joints.
  // 1.0 means perfectly level; decreases with any imbalance.
  const shDiff = Math.abs(lSh.y - rSh.y) / shoulderWidth;
  let hipDiff = null;
  let spineLean = null;
  const hipsVisible =
    (lHip?.visibility ?? 0) >= MIN_VIS && (rHip?.visibility ?? 0) >= MIN_VIS;
  if (hipsVisible) {
    const hipMid = mid(lHip, rHip);
    hipDiff = Math.abs(lHip.y - rHip.y) / shoulderWidth;
    const spineVec = sub(shMid, hipMid);
    spineLean = angleFromVertical(spineVec);
  }
  const symmetry = Math.max(
    0,
    1 - (shDiff + (hipDiff ?? shDiff)) / 0.2, // 0.2 ≈ "very asymmetric"
  );

  return {
    neckTilt,         // degrees, 0 = perfect
    headPitch,        // ratio, ~0.3 = level; larger = chin tucked down
    shoulderTilt,     // degrees, 0 = level
    shoulderHunch,    // ratio, ~0.45 = relaxed
    spineLean,        // degrees or null
    symmetry,         // 0..1
    hipsVisible,
  };
}

// ---------- sub-score penalty curve ------------------------------

/**
 * Convert a deviation into a 0..100 sub-score.
 *   deviation : how far we are from "ideal"
 *   tolerance : deviation that still gets ~100
 *   falloff   : deviation that gets ~50
 * Uses a smooth quadratic penalty that saturates at 0.
 */
function gradedScore(deviation, tolerance, falloff) {
  const d = Math.max(0, Math.abs(deviation) - tolerance);
  if (d === 0) return 100;
  const t = d / (falloff - tolerance);
  return Math.max(0, Math.round(100 * Math.exp(-t * t)));
}

/**
 * One-sided version of `gradedScore`. Only penalises deviation in the
 * given direction:
 *   sign = +1 → penalise `deviation > tolerance`
 *   sign = -1 → penalise `deviation < -tolerance`
 * Drift in the opposite direction always scores 100. Useful for metrics
 * where drift in one direction means "better posture" – e.g. a longer
 * neck than baseline means the user relaxed their shoulders, not that
 * anything got worse.
 */
function gradedScoreOneSided(deviation, tolerance, falloff, sign = 1) {
  const signed = sign * deviation;
  if (signed <= tolerance) return 100;
  const d = signed - tolerance;
  const t = d / (falloff - tolerance);
  return Math.max(0, Math.round(100 * Math.exp(-t * t)));
}

// ---------- calibration-aware scoring ---------------------------

const DEFAULT_BASELINE = {
  neckTilt: 0,
  headPitch: 0.3,
  shoulderTilt: 0,
  shoulderHunch: 0.45,
  spineLean: 0,
};

/**
 * Build a baseline from a short "sit up straight" calibration sample.
 * Robust to noise: averages metrics over `samples`.
 */
export function buildBaseline(metricsSamples) {
  if (!metricsSamples.length) return { ...DEFAULT_BASELINE };
  const keys = [
    "neckTilt",
    "headPitch",
    "shoulderTilt",
    "shoulderHunch",
    "spineLean",
  ];
  const acc = Object.fromEntries(keys.map((k) => [k, 0]));
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const m of metricsSamples) {
    for (const k of keys) {
      if (m[k] != null && Number.isFinite(m[k])) {
        acc[k] += m[k];
        counts[k] += 1;
      }
    }
  }
  const out = {};
  for (const k of keys) {
    out[k] = counts[k] ? acc[k] / counts[k] : DEFAULT_BASELINE[k];
  }
  return out;
}

/**
 * Turn metrics into a 0-100 score, per-metric breakdown, and human
 * feedback messages. `baseline` is what the user's posture looked like
 * during calibration – all deviations are measured relative to it.
 */
export function scorePosture(metrics, baseline = DEFAULT_BASELINE) {
  const subs = {
    neck: gradedScore(metrics.neckTilt - baseline.neckTilt, 5, 25),
    head:
      metrics.headPitch == null
        ? null
        : gradedScore(metrics.headPitch - baseline.headPitch, 0.05, 0.25),
    shoulders: gradedScore(
      metrics.shoulderTilt - baseline.shoulderTilt,
      3,
      15,
    ),
    // One-sided: only penalise the neck getting SHORTER than baseline
    // (shoulders creeping up toward the ears). A longer neck than
    // baseline just means the user relaxed their shoulders down, which
    // is the direction we want – it should never lose points.
    hunch: gradedScoreOneSided(
      metrics.shoulderHunch - baseline.shoulderHunch,
      0.05,
      0.25,
      -1,
    ),
    spine:
      metrics.spineLean == null
        ? null
        : gradedScore(metrics.spineLean - baseline.spineLean, 4, 20),
    symmetry: Math.round(metrics.symmetry * 100),
  };

  // Weights sum to 1 when all metrics available; renormalised otherwise.
  const weights = {
    neck: 0.2,
    head: 0.25,
    shoulders: 0.15,
    hunch: 0.15,
    spine: 0.15,
    symmetry: 0.1,
  };

  let total = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (subs[k] == null) continue;
    total += subs[k] * w;
    wsum += w;
  }
  const score = wsum > 0 ? Math.round(total / wsum) : 0;

  // Build feedback messages. Each rule looks at metric+sub-score and
  // emits at most one actionable tip.
  const feedback = [];
  if (subs.neck < 80) {
    feedback.push({
      severity: subs.neck < 55 ? "bad" : "warn",
      metric: "neck",
      message:
        metrics.neckTilt - baseline.neckTilt > 0
          ? "Head is pushed forward — pull your chin back over your shoulders."
          : "Head is leaning back — relax your neck.",
    });
  }
  if (subs.head != null && subs.head < 80) {
    const delta = metrics.headPitch - baseline.headPitch;
    feedback.push({
      severity: subs.head < 55 ? "bad" : "warn",
      metric: "head",
      message:
        delta > 0
          ? "Chin is tucked down — lift your head so your eyes are level."
          : "Chin is lifted — bring your head back to a neutral, level gaze.",
    });
  }
  if (subs.shoulders < 80) {
    feedback.push({
      severity: subs.shoulders < 55 ? "bad" : "warn",
      metric: "shoulders",
      message:
        metrics.shoulderTilt - baseline.shoulderTilt > 0
          ? "Right shoulder is dropping — level your shoulders."
          : "Left shoulder is dropping — level your shoulders.",
    });
  }
  if (subs.hunch < 80) {
    feedback.push({
      severity: subs.hunch < 55 ? "bad" : "warn",
      metric: "hunch",
      message:
        "Shoulders are creeping up toward your ears — drop and relax them.",
    });
  }
  if (subs.spine != null && subs.spine < 80) {
    feedback.push({
      severity: subs.spine < 55 ? "bad" : "warn",
      metric: "spine",
      message: "Torso is leaning — stack your shoulders over your hips.",
    });
  }
  if (subs.symmetry < 75) {
    feedback.push({
      severity: subs.symmetry < 55 ? "bad" : "warn",
      metric: "symmetry",
      message: "Left/right sides look uneven — try centering your weight.",
    });
  }

  if (feedback.length === 0) {
    feedback.push({
      severity: "good",
      metric: "overall",
      message: "Great posture — hold it!",
    });
  }

  return { score, subs, feedback };
}

// ---------- exponential smoothing helper ------------------------

/**
 * Pose data is noisy frame-to-frame. We smooth metrics and scores with a
 * cheap exponential moving average so the UI doesn't flicker.
 */
export function makeEMA(alpha = 0.3) {
  let value = null;
  return (next) => {
    if (next == null || !Number.isFinite(next)) return value;
    value = value == null ? next : alpha * next + (1 - alpha) * value;
    return value;
  };
}

export { DEFAULT_BASELINE };
