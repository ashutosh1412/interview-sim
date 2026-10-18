import { useEffect, useRef } from "react";
import type { Thread } from "../../shared/schemas.ts";
import { STATUS_LABEL } from "../catalog.ts";

interface Props {
  threads: Thread[];
  drafts: Record<string, string>;
  selectedThreadId: string | null;
  readOnly: boolean;
  onDraft: (threadId: string, text: string) => void;
  onSelect: (threadId: string) => void;
}

function targetText(t: Thread): string {
  return t.target.kind === "global" ? "Whole design" : `${t.target.kind} ${t.target.id}`;
}

export function ThreadPanel({ threads, drafts, selectedThreadId, readOnly, onDraft, onSelect }: Props) {
  const refs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (selectedThreadId) refs.current.get(selectedThreadId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedThreadId]);

  const numbered = threads.map((thread, i) => ({ thread, num: i + 1 }));
  const active = numbered.filter(({ thread }) => thread.status !== "resolved");
  const resolved = numbered.filter(({ thread }) => thread.status === "resolved");

  if (threads.length === 0) {
    return (
      <section className="threads">
        <h2 className="panel-title">Interviewer</h2>
        <p className="hint">Sketch your high-level design, then press <strong>Submit for review</strong>. Questions will appear as numbered circles on your components.</p>
      </section>
    );
  }

  return (
    <section className="threads" aria-label="Interviewer questions">
      <h2 className="panel-title">
        Interviewer <span className="muted">{active.length} open · {resolved.length} resolved</span>
      </h2>
      <ol className="threads__list">
        {active.map(({ thread, num }) => (
          <li
            key={thread.id}
            ref={(el) => {
              if (el) refs.current.set(thread.id, el);
              else refs.current.delete(thread.id);
            }}
            className={`thread thread--${thread.status}${selectedThreadId === thread.id ? " is-selected" : ""}`}
            onClick={() => onSelect(thread.id)}
          >
            <div className="thread__head">
              <span className={`badge badge--${thread.status} badge--${thread.type}`}>{num}</span>
              <span className="thread__meta">
                {thread.type} · {targetText(thread)} · {STATUS_LABEL[thread.status]}
                {thread.source === "rules" && " · auto-check"}
              </span>
            </div>
            <p className="thread__text">{thread.text}</p>
            {thread.answers.map((answer, i) => (
              <div key={i} className="thread__exchange">
                <p className="thread__answer"><span className="muted">You:</span> {answer}</p>
                {thread.followups[i] && <p className="thread__followup"><span className="muted">Interviewer:</span> {thread.followups[i]}</p>}
              </div>
            ))}
            {thread.status !== "answered" && !readOnly && (
              <textarea
                className="thread__input"
                rows={2}
                maxLength={2000}
                placeholder={thread.source === "rules" ? "Fix it in the design, or explain your reasoning…" : "Your answer…"}
                value={drafts[thread.id] ?? ""}
                onChange={(e) => onDraft(thread.id, e.target.value)}
                onFocus={() => onSelect(thread.id)}
              />
            )}
            {thread.status === "answered" && <p className="hint">Answer sent. It will be graded on the next submit.</p>}
          </li>
        ))}
      </ol>
      {resolved.length > 0 && (
        <details className="threads__resolved">
          <summary>{resolved.length} resolved</summary>
          <ol className="threads__list">
            {resolved.map(({ thread, num }) => (
              <li key={thread.id} className="thread thread--resolved">
                <span className="badge badge--resolved">{num}</span> {thread.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
