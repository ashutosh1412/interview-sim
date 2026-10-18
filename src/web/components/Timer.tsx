import { useEffect, useRef, useState } from "react";

interface Props {
  startedAt: string;
  durationMin: number;
  stopped: boolean;
  onExpire: () => void;
}

const WARN_MS = 5 * 60_000;

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Counts down from the server's start time, so a page refresh never resets the clock. */
export function Timer({ startedAt, durationMin, stopped, onExpire }: Props) {
  const deadline = Date.parse(startedAt) + durationMin * 60_000;
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stopped]);

  const remaining = deadline - now;
  useEffect(() => {
    if (!stopped && remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current();
    }
  }, [remaining, stopped]);

  const state = stopped ? "stopped" : remaining <= 0 ? "over" : remaining <= WARN_MS ? "warn" : "ok";
  return (
    <div className={`timer timer--${state}`} role="timer" aria-live="off">
      {stopped ? "Finished" : remaining <= 0 ? "Time's up" : format(remaining)}
      <span className="muted"> / {durationMin}m</span>
    </div>
  );
}
