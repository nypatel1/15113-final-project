/**
 * FeedbackPanel: renders the per-metric breakdown and actionable tips.
 */

const METRIC_LABELS = {
  neck: "Neck / head",
  shoulders: "Shoulder level",
  hunch: "Shoulder hunch",
  spine: "Spine lean",
  symmetry: "L/R symmetry",
};

export default function FeedbackPanel({ metrics, subs, feedback }) {
  return (
    <div className="feedback-panel">
      <div className="metric-grid">
        {Object.entries(METRIC_LABELS).map(([key, label]) => {
          const sub = subs[key];
          if (sub == null) {
            return (
              <div key={key} className="metric disabled">
                <div className="metric-label">{label}</div>
                <div className="metric-bar">
                  <span className="metric-bar-fill" style={{ width: "0%" }} />
                </div>
                <div className="metric-value">n/a</div>
              </div>
            );
          }
          const cls = sub >= 80 ? "good" : sub >= 55 ? "ok" : "bad";
          return (
            <div key={key} className={`metric ${cls}`}>
              <div className="metric-label">{label}</div>
              <div className="metric-bar">
                <span
                  className="metric-bar-fill"
                  style={{ width: `${sub}%` }}
                />
              </div>
              <div className="metric-value">{sub}</div>
            </div>
          );
        })}
      </div>

      <div className="raw-metrics">
        <MetricRow label="Neck tilt" value={fmt(metrics.neckTilt, "°")} />
        <MetricRow
          label="Shoulder tilt"
          value={fmt(metrics.shoulderTilt, "°")}
        />
        <MetricRow
          label="Neck / shoulder"
          value={fmt(metrics.shoulderHunch, "x")}
        />
        <MetricRow
          label="Spine lean"
          value={metrics.spineLean == null ? "—" : fmt(metrics.spineLean, "°")}
        />
      </div>

      <ul className="feedback-list">
        {feedback.map((f, i) => (
          <li key={i} className={`feedback-item ${f.severity}`}>
            <span className="dot" />
            {f.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="raw-row">
      <span className="raw-label">{label}</span>
      <span className="raw-value">{value}</span>
    </div>
  );
}

function fmt(v, suffix = "") {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}${suffix}`;
}
