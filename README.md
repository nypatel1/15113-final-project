# AI Posture Coach

A browser-based posture coach that watches you through your webcam, scores your posture in real time, and tracks how you do over time.

You can run it here: https://nypatel1.github.io/15113-final-project/

## What it does

Each frame of your webcam is fed through MediaPipe's Pose Landmarker to produce 33 body landmarks. A custom analysis engine turns those landmarks into six interpretable metrics, forward-head angle, head pitch (nose vs. ear line), shoulder level, shoulder hunch, spine lean, and left/right symmetry, maps each to a 0–100 sub-score via a Gaussian-like penalty curve, and combines them with tunable weights into one posture score and a short list of actionable tips ("head is pushed forward", "chin is tucked down", etc.)

The app also tracks history: per-second samples are persisted to local storage and rendered as line / bar charts on a History tab with CSV export.


## How to use it

1. Open the live site (or run locally — see below) and click **Start camera**. Grant webcam permission when your browser asks.
2. Sit naturally and click "Calibrate posture". Hold the position for ~4 seconds while the progress banner ticks up.
3. A colored score chip appears in the corner — green (≥80), yellow (55–79), red (<55). The skeleton overlay changes color to match.
4. Metric bars and tips update live. An optional audio alert fires after a sustained slouch (toggle in the controls).
5. When you're done, click "stop & save session". Switch to the "History" tab to see trends over time, export CSV, or clear history.


## Features I'm most proud of

- The posture analysis engine, a small, dependency-free JS module that does the real work. Every metric is a short piece of vector math you can read top-to-bottom, every tolerance/weight is a one-line edit, and the whole thing is unit-tested against synthetic landmark data — so you can verify scoring before even turning on a webcam.
- Calibration-relative scoring. Posture is judged against your own "sit up straight" baseline, not a generic ideal. That makes the score fair across body types, chair heights, and camera angles.


## How to run it locally

Requirements: Node 20+, a webcam, a recent Chrome / Edge / Safari.

cd posture-coach
npm install
npm run dev           # http://localhost:5173
