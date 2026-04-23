Tools
- Cursor IDE with agents, running Claude.
- Browser chat with Claude for the initial spec


Process

Spec:
Used Claude in browser chat to turn the assignment into SPEC.md:
data flow, modules, guiding principles.
  "
  I have to build a real-time posture coach in the browser. Help me write a SPEC.md that captures: the core objective, the 
  full data flow from camera to feedback, the module boundaries I should aim for, a list of non-negotiable functional 
  requirements and a list of optional enhancements, and the guiding principles. Keep it concrete enough that future prompts can reference 
  specific sections, not vague enough that it reads like marketing copy.
  "


Initial build:
  "
  Read SPEC.md. Scaffold a React app, build it in modular slices. Mirror the video so the user's left hand appears on the left.
  Everything client-side, no backend.
  "


After the first draft I asked the agent to explain one piece before
I signed off on it:
  "
  Walk me through how 'gradedScore(deviation, tolerance, falloff)' in postureAnalysis.js actually behaves. What do the 
  tolerance and falloff parameters each control in the output curve. I want to understand this well enough to tune it by eye 
  later.
  "
  Merged code


CI failed on main:
  "
  ESLint is flagging process.env in vite.config.js because the ESLint config only declares browser globals.
  "
  Fixed issue


headPitch metric:
Working on testing and improving the model, I started with a diagnosis prompt before any code change:
  "
  The app has this bug: when I tuck my chin down toward my chest the score goes UP, and when I sit upright with my head level
  it goes DOWN. Before you write any fix, explain in terms of the existing metrics exactly what's happening. Which metric is
  responsible, why is it moving in the wrong direction geometrically, and what physical assumption does it make that breaks 
  here? Then show me what a correct metric would need to measure that the current ones don't.
  "
  The agent correctly identified that neckTilt only measures ears vs shoulders, and nodding at the neck barely moves the ears
  (sometimes drifts them slightly backward), so "less forward head" reads as better. 


Testing experiment which I reverted:
  "
  Add a torsoLean metric derived from the z-coordinate of the shoulders (MediaPipe z grows toward the camera, so leaning
  in reads as more negative). Switch shoulderHunch scoring to one-sided too. Only penalise neck compression (shoulders 
  creeping up), not relaxation (longer neck than baseline).
  "
  14/14 tests passed and I merged it. On the live site the overlay felt cluttered and the torso metric didn't track how I 
  was actually sitting. Then I reverted.


Re-apply the good part from the change:
  "
  Look at the shoulder hunch scoring as it exists on main right now. Walk me through exactly what a user has to do to get a
  perfect hunch sub-score, and explain why the current gradedScore(deviation, tolerance, falloff) formulation punishes
  relaxed shoulders. Be specific, I want to know why Math.abs on the deviation is the root cause, not just that 'the
  curve is symmetric'.
  "


Then I confirmed I scoped the fix tightly:
  "
  Add a helper to postureAnalysis.js. Switch ONLY the hunch sub-score to use it with sign=-1 so only neck compression loses 
  points. Do NOT touch any other metric, weight, UI file, or component. Add two tests that would have aught the bug: (1) 
  relaxed shoulders (longer neck than baseline) keeps hunch at 100 with no hunch feedback; (2) shrugged shoulders
  (shorter neck) still drops the sub-score.
  "


Asymmetric head pitch:
  "
  The 'head' sub-score uses gradedScore, which is symmetric. That's wrong for this metric specifically: chin DOWN is the 
  ergonomic problem and should be penalised; chin UP a little usually just means the monitor is at eye level,
  which is fine.
  "

Final prompts:
  "
  Give me a tour of the code in the order that data actually flows, one paragraph per file: main.jsx, App.jsx, PoseCoach.jsx,
  poseDetector.js, postureAnalysis.js, sessionStore.js, HistoryView.jsx. For each file, tell me the one thing it's
  responsible for, the shape of the data it receives, and the shape of the data it produces. I want this accurate enough to
  describe without re-reading the code.
  "
