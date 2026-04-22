/**
 * Tiny sanity tests for the posture analysis engine.
 * Run with: node --test src/lib/postureAnalysis.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LM,
  computeMetrics,
  scorePosture,
  buildBaseline,
  hasEnoughLandmarks,
  DEFAULT_BASELINE,
} from "./postureAnalysis.js";

/**
 * Build a minimal 33-element landmark array seeded with a neutral pose.
 *
 * Coordinates are in MediaPipe's normalized image space where +y points
 * DOWN. "neckDx" offsets the ears forward (simulating forward head);
 * "noseDy" offsets the nose / mouth vertically below the ear line,
 * simulating a tucked chin (positive) or lifted chin (negative).
 */
function neutralPose({
  neckDx = 0,
  shoulderDy = 0,
  neckLen = 0.12,
  shoulderWidth = 0.26,
  earDistance = 0.1,
  noseDy = 0,
  shoulderZ = 0, // MediaPipe z: negative = closer to camera (leaning in)
} = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const midX = 0.5;
  const shY = 0.5;
  const earY = shY - neckLen;

  lm[LM.LEFT_SHOULDER] = { x: midX - shoulderWidth / 2, y: shY, z: shoulderZ, visibility: 0.95 };
  lm[LM.RIGHT_SHOULDER] = {
    x: midX + shoulderWidth / 2,
    y: shY + shoulderDy,
    z: shoulderZ,
    visibility: 0.95,
  };

  // Ears above shoulders, slightly offset by neckDx to simulate forward head.
  lm[LM.LEFT_EAR] = { x: midX - earDistance / 2 + neckDx, y: earY, z: 0, visibility: 0.9 };
  lm[LM.RIGHT_EAR] = { x: midX + earDistance / 2 + neckDx, y: earY, z: 0, visibility: 0.9 };

  // Nose sits ~0.3 * ear-distance below the ear line for a level gaze;
  // noseDy lets tests simulate chin-tuck / chin-lift above or below that.
  const neutralNoseOffset = 0.3 * earDistance;
  const noseY = earY + neutralNoseOffset + noseDy;
  lm[LM.NOSE] = { x: midX + neckDx, y: noseY, z: 0, visibility: 0.9 };
  // Mouth a touch lower than the nose; used for the pitch axis.
  const mouthY = noseY + 0.04;
  lm[LM.MOUTH_LEFT] = { x: midX - 0.02 + neckDx, y: mouthY, z: 0, visibility: 0.9 };
  lm[LM.MOUTH_RIGHT] = { x: midX + 0.02 + neckDx, y: mouthY, z: 0, visibility: 0.9 };

  lm[LM.LEFT_HIP] = { x: midX - 0.1, y: shY + 0.3, z: 0, visibility: 0.9 };
  lm[LM.RIGHT_HIP] = { x: midX + 0.1, y: shY + 0.3, z: 0, visibility: 0.9 };
  return lm;
}

test("hasEnoughLandmarks accepts a well-visible pose", () => {
  assert.equal(hasEnoughLandmarks(neutralPose()), true);
});

test("hasEnoughLandmarks rejects missing data", () => {
  const pose = neutralPose();
  pose[LM.LEFT_SHOULDER].visibility = 0.1;
  assert.equal(hasEnoughLandmarks(pose), false);
});

test("neutral pose scores near 100", () => {
  const m = computeMetrics(neutralPose());
  const { score } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(score >= 85, `expected high score, got ${score}`);
  assert.ok(Math.abs(m.neckTilt) < 1);
  assert.ok(Math.abs(m.shoulderTilt) < 1);
});

test("forward head tilt lowers neck sub-score", () => {
  const forward = neutralPose({ neckDx: 0.06 });
  const m = computeMetrics(forward);
  const { subs } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(m.neckTilt > 10, `expected forward tilt, got ${m.neckTilt}`);
  assert.ok(subs.neck < 80, `expected low neck sub-score, got ${subs.neck}`);
});

test("uneven shoulders flagged by shoulders metric", () => {
  const tilted = neutralPose({ shoulderDy: 0.05 });
  const m = computeMetrics(tilted);
  const { subs, feedback } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(Math.abs(m.shoulderTilt) > 5);
  assert.ok(subs.shoulders < 80);
  assert.ok(feedback.some((f) => f.metric === "shoulders"));
});

test("calibration baseline pulls score back up", () => {
  const slouched = neutralPose({ neckDx: 0.06 });
  const metrics = computeMetrics(slouched);
  const baseline = buildBaseline([metrics, metrics, metrics]);
  const { score } = scorePosture(metrics, baseline);
  assert.ok(
    score >= 90,
    `expected score near 100 once baseline matches, got ${score}`,
  );
});

test("score function produces feedback messages when posture is bad", () => {
  const bad = neutralPose({ neckDx: 0.1, shoulderDy: 0.08 });
  const m = computeMetrics(bad);
  const { feedback, score } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(score < 70);
  assert.ok(feedback.length >= 1);
});

test("chin tucked down lowers the head-pitch sub-score", () => {
  const tucked = neutralPose({ noseDy: 0.08 });
  const m = computeMetrics(tucked);
  const { subs, feedback } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(m.headPitch > DEFAULT_BASELINE.headPitch + 0.1,
    `expected tucked chin to raise headPitch, got ${m.headPitch}`);
  assert.ok(subs.head < 70, `expected low head sub-score, got ${subs.head}`);
  assert.ok(
    feedback.some((f) => f.metric === "head" && /tucked/i.test(f.message)),
    `expected 'chin tucked' feedback, got ${JSON.stringify(feedback)}`,
  );
});

test("chin lifted raises different head-pitch feedback", () => {
  const lifted = neutralPose({ noseDy: -0.08 });
  const m = computeMetrics(lifted);
  const { subs, feedback } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(m.headPitch < DEFAULT_BASELINE.headPitch - 0.05);
  assert.ok(subs.head < 70);
  assert.ok(
    feedback.some((f) => f.metric === "head" && /lifted/i.test(f.message)),
  );
});

test("level head + forward head are independently distinguishable", () => {
  // Forward head (ears ahead of shoulders) should not itself move headPitch.
  const forwardOnly = computeMetrics(neutralPose({ neckDx: 0.06 }));
  assert.ok(
    Math.abs(forwardOnly.headPitch - DEFAULT_BASELINE.headPitch) < 0.05,
    `headPitch should be stable under forward-head only, got ${forwardOnly.headPitch}`,
  );

  // Chin tucked (nose drops) should not itself change neckTilt.
  const tuckedOnly = computeMetrics(neutralPose({ noseDy: 0.08 }));
  assert.ok(
    Math.abs(tuckedOnly.neckTilt) < 2,
    `neckTilt should be stable under head-pitch only, got ${tuckedOnly.neckTilt}`,
  );
});

test("leaning forward (negative shoulder z) is penalised by back sub-score", () => {
  const leaning = neutralPose({ shoulderZ: -0.15 });
  const m = computeMetrics(leaning);
  const { subs, feedback } = scorePosture(m, DEFAULT_BASELINE);
  assert.ok(m.torsoLean > 0.4, `expected positive torsoLean, got ${m.torsoLean}`);
  assert.ok(subs.back < 70, `expected low back sub-score, got ${subs.back}`);
  assert.ok(
    feedback.some((f) => f.metric === "back" && /leaning in/i.test(f.message)),
    `expected "leaning in" feedback, got ${JSON.stringify(feedback)}`,
  );
});

test("leaning back does not penalise the back sub-score", () => {
  const leaningBack = neutralPose({ shoulderZ: 0.15 });
  const m = computeMetrics(leaningBack);
  const { subs } = scorePosture(m, DEFAULT_BASELINE);
  assert.equal(subs.back, 100, `expected leaning back to score 100, got ${subs.back}`);
});

test("relaxed shoulders (longer neck than baseline) never lose hunch points", () => {
  // Calibrate with a slightly-shrugged posture (short neck).
  const shrugged = computeMetrics(
    neutralPose({ neckLen: 0.08, earDistance: 0.1 }),
  );
  const baseline = buildBaseline([shrugged, shrugged, shrugged]);

  // Then relax: neck gets longer.
  const relaxed = computeMetrics(
    neutralPose({ neckLen: 0.14, earDistance: 0.1 }),
  );
  const { subs } = scorePosture(relaxed, baseline);
  assert.equal(
    subs.hunch,
    100,
    `expected relaxed shoulders to keep hunch at 100, got ${subs.hunch}`,
  );
});

test("shrugged shoulders (shorter neck than baseline) are penalised", () => {
  const baseline = DEFAULT_BASELINE;
  // Force the neck to be much shorter than baseline (0.45 * 0.26 ≈ 0.12).
  const shrugged = computeMetrics(
    neutralPose({ neckLen: 0.04, shoulderWidth: 0.26 }),
  );
  const { subs, feedback } = scorePosture(shrugged, baseline);
  assert.ok(subs.hunch < 70, `expected shrugged hunch sub-score low, got ${subs.hunch}`);
  assert.ok(feedback.some((f) => f.metric === "hunch"));
});
