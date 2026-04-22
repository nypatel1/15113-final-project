import { useEffect, useRef, useState, useCallback } from "react";
import { createPoseDetector, POSE_CONNECTIONS } from "../lib/poseDetector.js";
import {
  computeMetrics,
  scorePosture,
  hasEnoughLandmarks,
  buildBaseline,
  makeEMA,
  DEFAULT_BASELINE,
  LM,
} from "../lib/postureAnalysis.js";
import {
  createSession,
  addSample,
  finalizeSession,
  saveSession,
} from "../lib/sessionStore.js";
import FeedbackPanel from "./FeedbackPanel.jsx";

const CALIBRATION_MS = 4000;

export default function PoseCoach({ onSessionSaved }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const sessionRef = useRef(null);
  const lastSampleAtRef = useRef(0);
  const baselineRef = useRef(DEFAULT_BASELINE);
  const calibrationSamplesRef = useRef(null); // null = not calibrating
  const calibrationDoneAtRef = useRef(0);
  const scoreEMARef = useRef(makeEMA(0.25));
  const metricEMAsRef = useRef({
    neckTilt: makeEMA(0.3),
    headPitch: makeEMA(0.3),
    shoulderTilt: makeEMA(0.3),
    shoulderHunch: makeEMA(0.3),
    torsoLean: makeEMA(0.2),
    spineLean: makeEMA(0.3),
  });

  const [status, setStatus] = useState("idle"); // idle|loading|ready|error
  const [errorMsg, setErrorMsg] = useState("");
  const [running, setRunning] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [metricsDisplay, setMetricsDisplay] = useState(null);
  const [subsDisplay, setSubsDisplay] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [poorPostureBeep, setPoorPostureBeep] = useState(true);
  const poorStreakRef = useRef(0);
  const lastBeepRef = useRef(0);

  // ---------- model + camera init ---------------------------------
  const setupCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    const video = videoRef.current;
    video.srcObject = stream;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(resolve);
      };
    });
    return stream;
  }, []);

  const start = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      if (!detectorRef.current) {
        detectorRef.current = await createPoseDetector();
      }
      await setupCamera();
      setStatus("ready");
      setRunning(true);
      sessionRef.current = createSession();
      lastSampleAtRef.current = 0;
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e?.message ||
          "Could not start camera / model. Check webcam permissions and reload.",
      );
      setStatus("error");
    }
  }, [setupCamera]);

  const stop = useCallback(() => {
    setRunning(false);
    cancelAnimationFrame(rafRef.current);
    const video = videoRef.current;
    if (video?.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    if (sessionRef.current && sessionRef.current.samples.length > 0) {
      const finalized = finalizeSession(sessionRef.current);
      saveSession(finalized);
      onSessionSaved?.(finalized);
    }
    sessionRef.current = null;
  }, [onSessionSaved]);

  // clean up on unmount
  useEffect(() => {
    const videoNode = videoRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (videoNode?.srcObject) {
        videoNode.srcObject.getTracks().forEach((t) => t.stop());
      }
      detectorRef.current?.close();
    };
  }, []);

  // ---------- calibration -----------------------------------------
  const beginCalibration = useCallback(() => {
    calibrationSamplesRef.current = [];
    calibrationDoneAtRef.current = performance.now() + CALIBRATION_MS;
    setCalibrating(true);
    setCalibrationProgress(0);
  }, []);

  // ---------- main loop -------------------------------------------
  useEffect(() => {
    if (!running) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const loop = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(loop);
      if (video.readyState < 2) return;

      // Resize canvas once to match the video.
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const now = performance.now();
      const result = detectorRef.current?.detect(video, now);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = result?.landmarks?.[0];
      if (!landmarks || !hasEnoughLandmarks(landmarks)) {
        drawHint(ctx, canvas, "Step into frame — shoulders & face visible");
        return;
      }

      const rawMetrics = computeMetrics(landmarks);

      // Smooth metrics.
      const smoothedMetrics = {
        ...rawMetrics,
        neckTilt: metricEMAsRef.current.neckTilt(rawMetrics.neckTilt) ?? rawMetrics.neckTilt,
        headPitch:
          rawMetrics.headPitch == null
            ? null
            : metricEMAsRef.current.headPitch(rawMetrics.headPitch) ?? rawMetrics.headPitch,
        shoulderTilt: metricEMAsRef.current.shoulderTilt(rawMetrics.shoulderTilt) ?? rawMetrics.shoulderTilt,
        shoulderHunch: metricEMAsRef.current.shoulderHunch(rawMetrics.shoulderHunch) ?? rawMetrics.shoulderHunch,
        torsoLean:
          rawMetrics.torsoLean == null
            ? null
            : metricEMAsRef.current.torsoLean(rawMetrics.torsoLean) ?? rawMetrics.torsoLean,
        spineLean:
          rawMetrics.spineLean == null
            ? null
            : metricEMAsRef.current.spineLean(rawMetrics.spineLean) ?? rawMetrics.spineLean,
      };

      // Handle calibration: collect samples for a few seconds.
      if (calibrationSamplesRef.current) {
        calibrationSamplesRef.current.push(smoothedMetrics);
        const remaining = calibrationDoneAtRef.current - now;
        const pct = Math.min(
          100,
          Math.round(((CALIBRATION_MS - remaining) / CALIBRATION_MS) * 100),
        );
        setCalibrationProgress(pct);
        if (remaining <= 0) {
          baselineRef.current = buildBaseline(calibrationSamplesRef.current);
          calibrationSamplesRef.current = null;
          setCalibrating(false);
        }
      }

      const { score, subs, feedback: fb } = scorePosture(
        smoothedMetrics,
        baselineRef.current,
      );
      const smoothedScore =
        scoreEMARef.current(score) ?? score;
      const displayScore = Math.round(smoothedScore);

      drawSkeleton(ctx, canvas, landmarks, displayScore);

      setScoreDisplay(displayScore);
      setMetricsDisplay(smoothedMetrics);
      setSubsDisplay(subs);
      setFeedback(fb);

      // ---- record sample at ~1Hz ----
      if (sessionRef.current && now - lastSampleAtRef.current > 1000) {
        addSample(sessionRef.current, {
          t: Date.now(),
          score: displayScore,
          subs,
        });
        lastSampleAtRef.current = now;
      }

      // ---- poor-posture alert (beep after ~5s of red score) ----
      if (displayScore < 55) {
        poorStreakRef.current += 1;
      } else {
        poorStreakRef.current = 0;
      }
      if (
        poorPostureBeep &&
        poorStreakRef.current > 60 && // ~1s @ 60fps
        now - lastBeepRef.current > 8000
      ) {
        beep();
        lastBeepRef.current = now;
      }
    };

    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, poorPostureBeep]);

  // ---------- render ----------------------------------------------
  return (
    <div className="pose-coach">
      <div className="video-wrap">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        {status === "idle" && (
          <div className="video-overlay">
            <button className="primary" onClick={start}>
              Start camera
            </button>
            <p className="hint">
              We&apos;ll ask for webcam access. Nothing leaves your device.
            </p>
          </div>
        )}
        {status === "loading" && (
          <div className="video-overlay">
            <div className="spinner" />
            <p>Loading pose model…</p>
          </div>
        )}
        {status === "error" && (
          <div className="video-overlay error">
            <p>{errorMsg}</p>
            <button onClick={start}>Retry</button>
          </div>
        )}
        {calibrating && (
          <div className="calibration-banner">
            Sit up straight — calibrating ({calibrationProgress}%)
          </div>
        )}
        {running && !calibrating && (
          <div
            className={`score-chip ${scoreClass(scoreDisplay)}`}
            title="Current posture score"
          >
            {scoreDisplay}
          </div>
        )}
      </div>

      {running && (
        <div className="controls">
          <button onClick={beginCalibration} disabled={calibrating}>
            {calibrating ? "Calibrating…" : "Calibrate posture"}
          </button>
          <button onClick={stop}>Stop &amp; save session</button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={poorPostureBeep}
              onChange={(e) => setPoorPostureBeep(e.target.checked)}
            />
            Audio alert on slouch
          </label>
        </div>
      )}

      {running && metricsDisplay && subsDisplay && (
        <FeedbackPanel
          metrics={metricsDisplay}
          subs={subsDisplay}
          feedback={feedback}
        />
      )}
    </div>
  );
}

// ---------- drawing helpers ---------------------------------------

function scoreClass(s) {
  if (s >= 80) return "good";
  if (s >= 55) return "ok";
  return "bad";
}

function drawHint(ctx, canvas, text) {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
  ctx.fillStyle = "#fff";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText(text, 16, canvas.height - 24);
}

function drawSkeleton(ctx, canvas, landmarks, score) {
  const color =
    score >= 80 ? "#4ade80" : score >= 55 ? "#facc15" : "#f87171";

  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  for (const [a, b] of POSE_CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 0) < 0.3 || (lb.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
    ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
    ctx.stroke();
  }

  // Highlight key joints.
  const key = [LM.LEFT_EAR, LM.RIGHT_EAR, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER];
  for (const i of key) {
    const p = landmarks[i];
    if (!p || (p.visibility ?? 0) < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Face framing + chin line. Makes it obvious where the app is reading
  // head pitch and lets the user correlate what they see with the score.
  drawFaceOverlay(ctx, canvas, landmarks, color);

  // Draw guide line: shoulder-midpoint vertical.
  const lSh = landmarks[LM.LEFT_SHOULDER];
  const rSh = landmarks[LM.RIGHT_SHOULDER];
  if (lSh && rSh) {
    const mx = ((lSh.x + rSh.x) / 2) * canvas.width;
    const my = ((lSh.y + rSh.y) / 2) * canvas.height;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Draws a face "frame" on the canvas:
 *   - A rounded rectangle around the face, aligned to the ear line so
 *     the user can see the app's idea of head orientation.
 *   - A horizontal line across the ears (the "pitch horizon").
 *   - A dot on the nose.
 *   - A short chin line below the mouth, showing the head-pitch axis.
 * Everything scales with the distance between the ears so it looks
 * right whether the user is close to or far from the camera.
 */
function drawFaceOverlay(ctx, canvas, landmarks, color) {
  const lEar = landmarks[LM.LEFT_EAR];
  const rEar = landmarks[LM.RIGHT_EAR];
  const nose = landmarks[LM.NOSE];
  const mouthL = landmarks[LM.MOUTH_LEFT];
  const mouthR = landmarks[LM.MOUTH_RIGHT];
  if (!lEar || !rEar) return;
  if ((lEar.visibility ?? 0) < 0.3 || (rEar.visibility ?? 0) < 0.3) return;

  const W = canvas.width;
  const H = canvas.height;

  const toPx = (p) => ({ x: p.x * W, y: p.y * H });
  const lEarP = toPx(lEar);
  const rEarP = toPx(rEar);
  const earMidP = { x: (lEarP.x + rEarP.x) / 2, y: (lEarP.y + rEarP.y) / 2 };

  // Work in a local frame where +X runs along the ear line and +Y is
  // perpendicular to it ("down the face"). That way the face frame
  // stays aligned when the user tilts their head sideways.
  const dx = rEarP.x - lEarP.x;
  const dy = rEarP.y - lEarP.y;
  const earDistPx = Math.hypot(dx, dy);
  if (earDistPx < 8) return; // degenerate
  const ux = dx / earDistPx; // unit vector along ear line
  const uy = dy / earDistPx;
  const nx = -uy; // unit vector perpendicular ("down the face")
  const ny = ux;

  // Rectangle dimensions, expressed as multiples of ear distance.
  const halfW = earDistPx * 0.9;  // slightly wider than the ears
  const topH = earDistPx * 0.6;   // from ear line up to crown
  const bottomH = earDistPx * 1.1; // from ear line down past the chin
  const radius = earDistPx * 0.25;

  const corners = [
    // top-left (in local space)
    { s: -halfW, t: -topH },
    { s:  halfW, t: -topH },
    { s:  halfW, t:  bottomH },
    { s: -halfW, t:  bottomH },
  ].map(({ s, t }) => ({
    x: earMidP.x + s * ux + t * nx,
    y: earMidP.y + s * uy + t * ny,
  }));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  roundedPolygon(ctx, corners, radius);
  ctx.stroke();

  // Ear-line horizon across the rectangle.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(earMidP.x - halfW * ux, earMidP.y - halfW * uy);
  ctx.lineTo(earMidP.x + halfW * ux, earMidP.y + halfW * uy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Nose dot.
  if ((nose?.visibility ?? 0) >= 0.3) {
    const noseP = toPx(nose);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(noseP.x, noseP.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Chin line: from ear-midpoint to nose, extended down to the chin
    // region. Visualises the head-pitch axis so the user can see what
    // the metric is actually measuring.
    const axisX = noseP.x - earMidP.x;
    const axisY = noseP.y - earMidP.y;
    const axisLen = Math.hypot(axisX, axisY);
    if (axisLen > 4) {
      const extend = earDistPx * 0.9; // push past the mouth toward the chin
      const ex = noseP.x + (axisX / axisLen) * extend;
      const ey = noseP.y + (axisY / axisLen) * extend;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(earMidP.x, earMidP.y);
      ctx.lineTo(noseP.x, noseP.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Small chin tick perpendicular to the axis at its end.
      const tick = earDistPx * 0.35;
      const px = -axisY / axisLen;
      const py = axisX / axisLen;
      ctx.beginPath();
      ctx.moveTo(ex - px * tick, ey - py * tick);
      ctx.lineTo(ex + px * tick, ey + py * tick);
      ctx.stroke();
    }
  }

  // Mouth dots (purely cosmetic – shows the framing is anchored on the
  // face, not floating).
  for (const m of [mouthL, mouthR]) {
    if ((m?.visibility ?? 0) < 0.3) continue;
    const p = toPx(m);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Stroke a rounded rectangle defined by four corners (in order). Works
 * for any convex quad, not just axis-aligned rectangles, so our face
 * frame can tilt with the head.
 */
function roundedPolygon(ctx, pts, radius) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    const r = Math.min(radius, l1 / 2, l2 / 2);

    const p1 = { x: curr.x + (v1x / l1) * r, y: curr.y + (v1y / l1) * r };
    const p2 = { x: curr.x + (v2x / l2) * r, y: curr.y + (v2y / l2) * r };

    if (i === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
  }
  ctx.closePath();
}

// ---------- audio alert -------------------------------------------

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 440;
    g.gain.value = 0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    o.stop(audioCtx.currentTime + 0.55);
  } catch {
    // no-op
  }
}
