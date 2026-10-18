import { STATUS_LABEL } from "../catalog.ts";
import { targetKey } from "../graph.ts";
import { useThreads } from "../threadsContext.ts";

export function Badges({ kind, id }: { kind: "node" | "edge"; id: string }) {
  const { byTarget, selectedThreadId, selectThread } = useThreads();
  const items = byTarget.get(targetKey(kind, id));
  if (!items?.length) return null;

  return (
    <div className="badges nodrag nopan">
      {items.map(({ num, thread }) => {
        const latestFollowup = thread.followups.at(-1);
        return (
          <button
            key={thread.id}
            type="button"
            className={`badge badge--${thread.status} badge--${thread.type}${selectedThreadId === thread.id ? " is-selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              selectThread(thread.id);
            }}
            aria-label={`Thread ${num}: ${thread.text}`}
          >
            {num}
            <span className="tip" role="tooltip">
              <span className="tip__meta">
                #{num} · {thread.type} · {STATUS_LABEL[thread.status]}
              </span>
              {thread.text}
              {thread.status === "followup" && latestFollowup && (
                <span className="tip__followup">Follow-up: {latestFollowup}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
