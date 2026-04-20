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
    shoulderTilt: makeEMA(0.3),
    shoulderHunch: makeEMA(0.3),
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
        shoulderTilt: metricEMAsRef.current.shoulderTilt(rawMetrics.shoulderTilt) ?? rawMetrics.shoulderTilt,
        shoulderHunch: metricEMAsRef.current.shoulderHunch(rawMetrics.shoulderHunch) ?? rawMetrics.shoulderHunch,
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
