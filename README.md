# AI Posture Coach — 15-113 final project

A browser-based posture coach that watches you through your webcam, scores your posture in real time, and tracks how you do over time. Everything runs **client-side** — no video, landmarks, or session data ever leave your machine.

Live site: https://nypatel1.github.io/15113-final-project/

## How it works (one paragraph)

Each frame of your webcam is fed through MediaPipe's Pose Landmarker (WebAssembly + GPU, in-browser) to produce 33 body landmarks. A small, dependency-free JavaScript module (`posture-coach/src/lib/postureAnalysis.js`) turns those landmarks into interpretable metrics — forward-head angle, head pitch (nose vs. ear line), shoulder level, shoulder hunch, symmetry — maps each to a 0–100 sub-score via a Gaussian-like penalty curve, and combines them with tunable weights into one posture score and a short list of actionable tips. A 4-second "sit up straight" calibration captures your personal baseline so you're scored against *you*, not a generic ideal. Per-second samples are persisted to `localStorage` and rendered as line/bar charts on a History tab with CSV export.

## Tech stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + Vite 8 |
| Pose ML | `@mediapipe/tasks-vision` (Pose Landmarker Lite, WASM + GPU) |
| Charts | Recharts |
| Persistence | `localStorage` (JSON) |
| Tests | `node --test` against synthetic landmark data |
| Deploy | GitHub Actions → GitHub Pages |

## Quick start

```bash
cd posture-coach
npm install
npm run dev        # http://localhost:5173
```

First load pulls the pose model (~10 MB) from Google's CDN, after which it's cached. Other scripts: `npm run build`, `npm run lint`, `npm run test`.

Full project README (architecture, posture math walkthrough, deploy notes): [`posture-coach/README.md`](./posture-coach/README.md).

## Repo layout

```
.github/workflows/deploy-pages.yml   # CI: lint + test + build + deploy
posture-coach/                       # the app
  src/
    App.jsx                          # tab shell (Live / History)
    components/
      PoseCoach.jsx                  # webcam + per-frame loop + overlay
      FeedbackPanel.jsx              # metric bars + actionable tips
      HistoryView.jsx                # Recharts + CSV export
    lib/
      postureAnalysis.js             # THE posture math (read first)
      postureAnalysis.test.js
      poseDetector.js                # MediaPipe wrapper
      sessionStore.js                # localStorage schema
SPEC.md                              # the open-ended build brief
REFLECTION.md                        # process / AI tools / what changed
posture-coach/prompt_log.txt         # per-PR development log
```

## How this project was built

I wrote the spec, sketched the data flow and module boundaries, then worked with a **Cursor cloud agent** (Claude, same agentic pattern as HW8) to scaffold and iterate. Each change was its own branch → PR → CI → merge, which let me revert bad ideas cheaply (PR #5 introduced a torso-lean metric and face overlay that felt wrong; reverted via PR #6). The posture math in `postureAnalysis.js` was built and unit-tested against synthetic landmark data *before* I turned on a webcam, so I could verify scoring in isolation. Real iteration came from using the app myself — head pitch scoring backwards was only obvious once I tried tucking my chin to my chest, and I added the `headPitch` metric (PR #4) in response.

More detail: [`REFLECTION.md`](./REFLECTION.md) (process writeup), [`posture-coach/prompt_log.txt`](./posture-coach/prompt_log.txt) (per-PR log).
