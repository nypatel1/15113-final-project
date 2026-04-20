/**
 * sessionStore.js
 * -----------------------------------------------------------------
 * Lightweight, localStorage-backed persistence for posture sessions.
 *
 * A "session" is a continuous stretch of the app being used. While
 * the session is active we sample the current posture state roughly
 * once per second and push it into an in-memory buffer. When the
 * session ends (tab close, "Stop" pressed, or inactivity) we flush
 * to localStorage under a single key.
 *
 * Schema (kept intentionally small so we never blow localStorage):
 *   sessions: [
 *     {
 *       id: string (uuid-ish),
 *       startedAt: number (ms),
 *       endedAt: number (ms),
 *       samples: [{ t: number, score: number, subs: {neck,...} }],
 *       avgScore: number,
 *       duration: number (seconds)
 *     }
 *   ]
 */

const KEY = "posture-coach:sessions";
const MAX_SESSIONS = 50;
const MAX_SAMPLES_PER_SESSION = 60 * 60; // 1 hour at 1Hz

export function loadSessions() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  try {
    const trimmed = sessions.slice(-MAX_SESSIONS);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch (e) {
    // Quota exceeded or storage disabled; best-effort only.
    console.warn("Failed to persist sessions:", e);
  }
}

export function saveSession(session) {
  const all = loadSessions();
  all.push(session);
  saveSessions(all);
}

export function clearSessions() {
  localStorage.removeItem(KEY);
}

export function createSession() {
  return {
    id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    endedAt: null,
    samples: [],
  };
}

export function addSample(session, sample) {
  if (session.samples.length >= MAX_SAMPLES_PER_SESSION) return;
  session.samples.push(sample);
}

export function finalizeSession(session) {
  session.endedAt = Date.now();
  session.duration = Math.round((session.endedAt - session.startedAt) / 1000);
  const scores = session.samples.map((s) => s.score).filter((n) => Number.isFinite(n));
  session.avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  return session;
}

export function exportSessionsCSV(sessions = loadSessions()) {
  const rows = [
    ["session_id", "started_at_iso", "t_offset_s", "score", "neck", "shoulders", "hunch", "spine", "symmetry"],
  ];
  for (const s of sessions) {
    for (const sample of s.samples) {
      rows.push([
        s.id,
        new Date(s.startedAt).toISOString(),
        Math.round((sample.t - s.startedAt) / 1000),
        sample.score,
        sample.subs?.neck ?? "",
        sample.subs?.shoulders ?? "",
        sample.subs?.hunch ?? "",
        sample.subs?.spine ?? "",
        sample.subs?.symmetry ?? "",
      ]);
    }
  }
  return rows.map((r) => r.join(",")).join("\n");
}
