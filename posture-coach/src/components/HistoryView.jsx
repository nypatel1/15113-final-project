import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { clearSessions, exportSessionsCSV } from "../lib/sessionStore.js";

export default function HistoryView({ sessions, onCleared }) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => a.startedAt - b.startedAt),
    [sessions],
  );

  const summaryData = useMemo(
    () =>
      sorted.map((s) => ({
        id: s.id.slice(-4),
        date: new Date(s.startedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        avgScore: s.avgScore ?? 0,
        durationMin: +(s.duration / 60).toFixed(1),
      })),
    [sorted],
  );

  const latestTimeline = useMemo(() => {
    const latest = sorted[sorted.length - 1];
    if (!latest) return [];
    return latest.samples.map((s) => ({
      t: Math.round((s.t - latest.startedAt) / 1000),
      score: s.score,
      neck: s.subs?.neck ?? null,
      shoulders: s.subs?.shoulders ?? null,
      hunch: s.subs?.hunch ?? null,
    }));
  }, [sorted]);

  const metricAverages = useMemo(() => {
    const keys = ["neck", "shoulders", "hunch", "spine", "symmetry"];
    const totals = Object.fromEntries(keys.map((k) => [k, 0]));
    const counts = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const s of sorted) {
      for (const sample of s.samples) {
        for (const k of keys) {
          const v = sample.subs?.[k];
          if (v != null && Number.isFinite(v)) {
            totals[k] += v;
            counts[k] += 1;
          }
        }
      }
    }
    return keys.map((k) => ({
      metric: k,
      avg: counts[k] ? Math.round(totals[k] / counts[k]) : 0,
    }));
  }, [sorted]);

  const handleExport = () => {
    const csv = exportSessionsCSV(sessions);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `posture-coach-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirm("Delete all saved posture sessions?")) return;
    clearSessions();
    onCleared?.();
  };

  if (sessions.length === 0) {
    return (
      <section className="history-view empty">
        <h2>History</h2>
        <p>
          No sessions yet. Start the camera, sit for a few minutes, and your
          posture history will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="history-view">
      <header className="history-header">
        <h2>History</h2>
        <div className="history-actions">
          <button onClick={handleExport}>Export CSV</button>
          <button className="danger" onClick={handleClear}>
            Clear history
          </button>
        </div>
      </header>

      <div className="history-stats">
        <Stat
          label="Sessions"
          value={sessions.length}
        />
        <Stat
          label="Total time"
          value={`${Math.round(
            sessions.reduce((a, s) => a + (s.duration ?? 0), 0) / 60,
          )} min`}
        />
        <Stat
          label="Average score"
          value={
            Math.round(
              sessions.reduce((a, s) => a + (s.avgScore ?? 0), 0) /
                sessions.length,
            ) || 0
          }
        />
      </div>

      <div className="chart-block">
        <h3>Average score per session</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={summaryData}>
            <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#9ca3af" />
            <YAxis domain={[0, 100]} stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                background: "#1f2430",
                border: "1px solid #2a2f3a",
              }}
            />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke="#4ade80"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {latestTimeline.length > 1 && (
        <div className="chart-block">
          <h3>Most recent session timeline</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={latestTimeline}>
              <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                stroke="#9ca3af"
                tickFormatter={(t) => `${t}s`}
              />
              <YAxis domain={[0, 100]} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  background: "#1f2430",
                  border: "1px solid #2a2f3a",
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#60a5fa" dot={false} />
              <Line type="monotone" dataKey="neck" stroke="#f472b6" dot={false} />
              <Line
                type="monotone"
                dataKey="shoulders"
                stroke="#fbbf24"
                dot={false}
              />
              <Line type="monotone" dataKey="hunch" stroke="#34d399" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="chart-block">
        <h3>Average sub-scores (all time)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={metricAverages}>
            <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
            <XAxis dataKey="metric" stroke="#9ca3af" />
            <YAxis domain={[0, 100]} stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                background: "#1f2430",
                border: "1px solid #2a2f3a",
              }}
            />
            <Bar dataKey="avg" fill="#818cf8" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
