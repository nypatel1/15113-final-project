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

/** Build a minimal 33-element landmark array seeded with a neutral pose. */
function neutralPose({
  neckDx = 0,
  shoulderDy = 0,
  neckLen = 0.12,
  shoulderWidth = 0.26,
} = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const midX = 0.5;
  const shY = 0.5;

  lm[LM.LEFT_SHOULDER] = { x: midX - shoulderWidth / 2, y: shY, z: 0, visibility: 0.95 };
  lm[LM.RIGHT_SHOULDER] = {
    x: midX + shoulderWidth / 2,
    y: shY + shoulderDy,
    z: 0,
    visibility: 0.95,
  };

  // Ears centered above shoulders, slightly offset by neckDx to simulate forward head.
  lm[LM.LEFT_EAR] = { x: midX - 0.05 + neckDx, y: shY - neckLen, z: 0, visibility: 0.9 };
  lm[LM.RIGHT_EAR] = { x: midX + 0.05 + neckDx, y: shY - neckLen, z: 0, visibility: 0.9 };

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
