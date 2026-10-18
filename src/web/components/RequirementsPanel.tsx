import { useState } from "react";
import type { Clarification, Requirements } from "../../shared/schemas.ts";

export type RequirementsDraft = Requirements;
export const EMPTY_REQUIREMENTS: RequirementsDraft = { functional: "", nonFunctional: "", estimates: "" };

interface Props {
  clarifications: Clarification[];
  draft: RequirementsDraft;
  locked: Requirements | null;
  busy: boolean;
  readOnly: boolean;
  onDraft: (draft: RequirementsDraft) => void;
  onAsk: (question: string) => Promise<boolean>;
  onLock: () => void;
}

function QandA({ clarifications }: { clarifications: Clarification[] }) {
  if (!clarifications.length) return <p className="hint">No clarifying questions asked.</p>;
  return (
    <ol className="qa">
      {clarifications.map((c) => (
        <li key={c.at}>
          <p className="qa__q">{c.question}</p>
          <p className="qa__a">{c.answer}</p>
        </li>
      ))}
    </ol>
  );
}

/** Read-only summary of the locked requirements and the Q&A. */
export function RequirementsSummary({ requirements, clarifications }: { requirements: Requirements; clarifications: Clarification[] }) {
  return (
    <>
      <dl className="req-summary">
        <dt>Functional</dt>
        <dd>{requirements.functional}</dd>
        <dt>Non-functional</dt>
        <dd>{requirements.nonFunctional}</dd>
        {requirements.estimates && (
          <>
            <dt>Estimates</dt>
            <dd>{requirements.estimates}</dd>
          </>
        )}
      </dl>
      {clarifications.length > 0 && <QandA clarifications={clarifications} />}
    </>
  );
}

export function RequirementsPanel({ clarifications, draft, locked, busy, readOnly, onDraft, onAsk, onLock }: Props) {
  const [question, setQuestion] = useState("");
  if (locked) return null;

  const ask = async () => {
    const q = question.trim();
    if (q.length < 3 || busy) return;
    if (await onAsk(q)) setQuestion("");
  };
  const ready = draft.functional.trim() !== "" && draft.nonFunctional.trim() !== "";

  return (
    <section className="requirements" aria-label="Requirements">
      <h2 className="panel-title">Step 1 · Requirements</h2>
      <p className="hint">Ask the interviewer anything unclear, then write what you'll build.</p>

      <QandA clarifications={clarifications} />
      {!readOnly && (
        <div className="ask">
          <input
            value={question}
            maxLength={500}
            placeholder="Ask the interviewer, e.g. How many users per day?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
            disabled={busy}
          />
          <button type="button" className="btn" onClick={() => void ask()} disabled={busy || question.trim().length < 3}>
            {busy ? "…" : "Ask"}
          </button>
        </div>
      )}

      <label className="field">
        Functional requirements
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.functional}
          disabled={readOnly}
          placeholder="e.g. Shorten a URL; redirect; custom aliases; links expire"
          onChange={(e) => onDraft({ ...draft, functional: e.target.value })}
        />
      </label>
      <label className="field">
        Non-functional requirements
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.nonFunctional}
          disabled={readOnly}
          placeholder="e.g. 99.99% available; redirect p99 < 50 ms; 100:1 read-heavy"
          onChange={(e) => onDraft({ ...draft, nonFunctional: e.target.value })}
        />
      </label>
      <label className="field">
        Estimates <span className="muted">(optional: only the numbers that change your design)</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={draft.estimates}
          disabled={readOnly}
          placeholder="e.g. 100M writes/month ≈ 40 writes/s; 100:1 reads ≈ 4k reads/s; 5 yrs × 6B rows × 500B ≈ 3TB"
          onChange={(e) => onDraft({ ...draft, estimates: e.target.value })}
        />
      </label>
      {!readOnly && (
        <button type="button" className="btn btn--primary" disabled={!ready || busy} onClick={onLock}>
          Lock requirements and continue
        </button>
      )}
      {!ready && <p className="hint">Functional and non-functional requirements are required. Keep features to the top 3 and give non-functional targets real numbers (e.g. p99 &lt; 200 ms).</p>}
    </section>
  );
}
