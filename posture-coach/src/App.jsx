import { useState } from "react";
import PoseCoach from "./components/PoseCoach.jsx";
import HistoryView from "./components/HistoryView.jsx";
import { loadSessions } from "./lib/sessionStore.js";
import "./App.css";

export default function App() {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [tab, setTab] = useState("live");

  const refreshSessions = () => setSessions(loadSessions());

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">Posture Coach</span>
        </div>
        <nav className="tabs">
          <button
            className={tab === "live" ? "active" : ""}
            onClick={() => setTab("live")}
          >
            Live
          </button>
          <button
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            History ({sessions.length})
          </button>
        </nav>
      </header>

      <main>
        {tab === "live" && <PoseCoach onSessionSaved={refreshSessions} />}
        {tab === "history" && (
          <HistoryView sessions={sessions} onCleared={refreshSessions} />
        )}
      </main>

      <footer className="app-footer">
        <span>Runs entirely in your browser — no video leaves your device.</span>
      </footer>
    </div>
  );
}
