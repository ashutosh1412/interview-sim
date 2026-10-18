import { useEffect, useState } from "react";
import { Interview } from "./components/Interview.tsx";
import { Setup } from "./components/Setup.tsx";

// The session id lives in the URL hash, so a refresh resumes the same interview.
const readSessionId = () => /^#\/s\/([a-zA-Z0-9-]+)$/.exec(window.location.hash)?.[1] ?? null;

export function App() {
  const [sessionId, setSessionId] = useState(readSessionId);

  useEffect(() => {
    const onHash = () => setSessionId(readSessionId());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!sessionId) return <Setup onStart={(id) => (window.location.hash = `#/s/${id}`)} />;
  return <Interview key={sessionId} sessionId={sessionId} onExit={() => (window.location.hash = "")} />;
}
