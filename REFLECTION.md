Process
I made the spec, showing the data flow and objectives of the project, and framed it with help from claude. Then I worked with 
cursor to architect it, determining the modules to determine the engine, a wrapper around it, then the React UI, then figuring
out history with localStorage + Recharts, then GitHub Actions to deploy to GitHub Pages. I wrote unit tests against the math 
with synthetic landmark data so I could verify scoring before turning on a webcam. After the minimum working version was up, 
I iterated on issues I only noticed while actually using the app (head pitch scoring backwards, hunch metric rewarding 
shrugged shoulders).

AI tools and strategies
I used Cursor with a cloud agent (the same agentic pattern as HW8), running Claude inside Cursor. For each change I started a 
fresh agent turn with a narrow prompt, and the agent handled the full branch. I reviewed every diff. I chose the agent 
workflow over browser chat because it keeps the unit of work as a PR, so reverting a bad change (I did this once with PR #5 to 
#6) was one click. I also used the AI as a reviewer when understanding. "what's wrong with this approach" and "explain the bug 
before you fix it" produced much better results than "add feature X".

Why
Small PRs with clear scope and tests for the math, this was important working with a vision model I would have to calibrate 
and work with. That kept the AI focused and made regressions cheap to catch and revert. No backend so the app is private and 
easy to deploy.

What changed vs. pre-113
Before 15-113 I would have written everything in one file, skipped tests, used AI as autocomplete, and committed straight to 
main. Now I plan the module boundaries first, separate logic from framework, write tests that pin behaviour, prompt the AI 
with real context instead of one-liners, and create better architecture using things like a spec. I'm clearly faster and the 
code is easier to explain.

With more time
I would want LLM-generated daily summaries of posture trends, and better back-lean detection (my first attempt using shoulder 
z didn't feel right and got reverted), along with more accuracy, and maybe a version of the app which can run in the background
or as an extension for users.
