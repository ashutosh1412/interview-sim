import { useEffect, useState } from "react";
import type { PublicProblem, Status } from "../../shared/schemas.ts";
import { api, ApiRequestError } from "../api.ts";

const DURATIONS = [30, 45, 60] as const;

export function Setup({ onStart }: { onStart: (sessionId: string) => void }) {
  const [problems, setProblems] = useState<PublicProblem[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [problemId, setProblemId] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(45);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.problems(), api.status()])
      .then(([p, s]) => {
        setProblems(p);
        setStatus(s);
        setProblemId((current) => current || (p[0]?.id ?? ""));
      })
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : "Could not load problems"));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.startSession(problemId, duration);
      onStart(session.id);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Could not start the interview");
      setBusy(false);
    }
  }

  return (
    <main className="setup">
      <h1>System design interview</h1>
      <p className="muted">Pick a problem and a time limit. The clock starts when you press Start.</p>

      <fieldset className="setup__problems">
        <legend>Problem</legend>
        {problems.map((p) => (
          <label key={p.id} className={`problem${problemId === p.id ? " is-on" : ""}`}>
            <input type="radio" name="problem" checked={problemId === p.id} onChange={() => setProblemId(p.id)} />
            <span className="problem__title">{p.title}</span>
            <span className="muted">{p.track}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="segmented">
        <legend>Time limit</legend>
        {DURATIONS.map((d) => (
          <label key={d} className={duration === d ? "is-on" : ""}>
            <input type="radio" name="duration" checked={duration === d} onChange={() => setDuration(d)} />
            {d} min
          </label>
        ))}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn btn--primary" disabled={!problemId || busy} onClick={start}>
        {busy ? "Starting…" : "Start interview"}
      </button>

      {status && (
        <p className="muted small">
          AI: <strong>{status.provider}</strong>
          {status.dryRun && " (dry run)"}
          {status.provider === "mock" && " (free, canned questions, no real AI)"}
          {status.provider === "claude-cli" && " (your Claude subscription)"}
          {status.provider === "api" && " (paid API)"} · tokens used today: {status.budget.usedToday.toLocaleString()}
        </p>
      )}
    </main>
  );
}
