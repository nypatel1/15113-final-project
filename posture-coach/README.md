# AI Posture Coach

A browser-based posture coach that watches you through your webcam, scores your posture in real time, and tracks how you do over time. Everything runs **client-side** – no video or landmarks ever leave your machine.

![tech](https://img.shields.io/badge/React-19-61dafb) ![mediapipe](https://img.shields.io/badge/MediaPipe-PoseLandmarker-4285f4) ![vite](https://img.shields.io/badge/Vite-8-646cff)

---

## What it does

- **Live pose tracking** – MediaPipe Pose Landmarker (run in-browser via WebAssembly + GPU delegate) produces 33 body landmarks per frame.
- **Posture analysis engine** – a small, readable JS module turns those landmarks into interpretable metrics (neck tilt, shoulder level, hunch, spine lean, symmetry) and combines them into a single 0–100 posture score.
- **Real-time feedback** – scores update on every frame and a skeleton overlay is drawn on top of the video. Actionable tips appear as the score drops ("head is pushed forward", "level your shoulders", etc.) and an optional audio alert fires after a sustained slouch.
- **Calibration** – a 4-second "sit up straight" capture builds your personal baseline so the coach scores you against *your* neutral pose, not a generic model.
- **Session history** – each run saves a lightweight time-series to `localStorage`. The History tab shows session-level trends, a timeline of your most recent session, average sub-scores, and CSV export.

## Tech stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + Vite 8 |
| Pose ML | `@mediapipe/tasks-vision` (PoseLandmarker Lite, WASM + GPU) |
| Charts | Recharts |
| Persistence | `localStorage` (JSON) |
| Tests | `node --test` |

## Quick start

```bash
cd posture-coach
npm install
npm run dev        # http://localhost:5173
```

First load pulls the pose model (~10 MB) from Google's CDN; after that it's cached.

Other scripts:

```bash
npm run build      # production bundle
npm run preview    # serve the bundle
npm run lint       # eslint
npm run test       # sanity tests for the analysis engine
```

## Project layout

```
src/
├── App.jsx                       # shell: tab switcher between Live + History
├── App.css                       # dark-mode styling
├── components/
│   ├── PoseCoach.jsx             # webcam + per-frame loop + overlay
│   ├── FeedbackPanel.jsx         # metric bars + feedback messages
│   └── HistoryView.jsx           # Recharts-based history + CSV export
└── lib/
    ├── poseDetector.js           # MediaPipe bootstrap (wasm + model)
    ├── postureAnalysis.js        # the posture math (read me first!)
    ├── postureAnalysis.test.js   # node --test unit tests
    └── sessionStore.js           # localStorage wrapper
```

## Posture analysis approach

`src/lib/postureAnalysis.js` is where the interesting logic lives. It is deliberately dependency-free, heavily commented, and unit tested. The pipeline is:

1. **Landmark gate.** Reject frames where key joints (ears, shoulders) are below `visibility` 0.5 so we never score garbage frames.
2. **Raw metrics.**
   - `neckTilt` – angle between the shoulder-midpoint→ear-midpoint vector and vertical. 0° is ideal; positive values mean forward head.
   - `shoulderTilt` – angle of the left→right shoulder line vs. horizontal. 0° is level.
   - `shoulderHunch` – ratio of neck length to shoulder width. Shrugged shoulders compress this ratio.
   - `spineLean` – angle of the hip-mid→shoulder-mid vector vs. vertical (only when hips are visible; skipped for typical seated webcam framing).
   - `symmetry` – how close the left/right shoulder and hip heights are (scaled to shoulder width).
3. **Calibration.** Averaging metrics over a short window produces a per-user baseline. Every deviation is measured relative to that baseline, so the score adapts to your body geometry and camera angle.
4. **Sub-scores.** Each metric gets a 0–100 sub-score via a Gaussian-like penalty curve `gradedScore(deviation, tolerance, falloff)`. Below `tolerance` = perfect, beyond `falloff` = near-zero.
5. **Combined score.** Weighted average (neck 35%, shoulders 20%, hunch 20%, spine 15%, symmetry 10%), renormalised when a metric is missing.
6. **Smoothing.** Scores and metrics flow through exponential moving averages so the UI doesn't flicker frame-to-frame.
7. **Feedback.** Rules inspect each sub-score and emit at most one targeted tip per metric.

This design is intentionally modular: every metric, tolerance, weight, and rule is one edit away, and new metrics (e.g. elbow angles) can be dropped in without touching the rest of the app.

## Deploying

The app is 100% static — **no backend is required**. Any static host that serves HTTPS works (webcam APIs require HTTPS or `localhost`).

### GitHub Pages (set up in this repo)

A GitHub Actions workflow at `.github/workflows/deploy-pages.yml` builds and deploys this app on every push to `main`. To enable it:

1. On GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or click **Run workflow** on the Actions tab).
4. The site will be published at `https://<your-username>.github.io/<repo-name>/`.

The workflow sets `VITE_BASE_PATH=/<repo-name>/` automatically so asset URLs resolve correctly under the project-site prefix. It also copies `index.html` to `404.html` as an SPA fallback and drops a `.nojekyll` file so Pages serves the `_`-prefixed Vite assets verbatim.

### Other static hosts (Vercel, Netlify, Cloudflare Pages, …)

These serve at the domain root, so no base path is needed:

- **Root directory**: `posture-coach`
- **Build command**: `npm run build`
- **Output directory**: `dist`

No environment variables are required.

## Privacy

- No backend, no analytics, no network calls beyond loading the pose model once.
- Webcam frames are processed in a `<video>`/`<canvas>` pipeline and discarded.
- Only compact per-second summaries (`{t, score, subs}`) are stored, and they live only in your browser's localStorage – clear them any time from the History tab.

## Possible extensions

- Spine curvature estimation using shoulder/hip rotation from the 3D landmarks.
- Reminders when average score drops for N minutes.
- Multi-profile support (switch between users/chairs).
- Web worker for detection to guarantee 60 fps UI even on weaker GPUs.
- Session replay with synchronized video + metric scrubber.

## License

MIT — see `LICENSE` if provided, otherwise treat as MIT for this coursework.
