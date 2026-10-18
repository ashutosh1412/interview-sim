// One JSON file per session. Writes go to a temp file first, then rename,
// so a crash mid-write never leaves a corrupt session behind.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionSchema, type Session } from "../../shared/schemas.ts";

const SAFE_ID = /^[a-zA-Z0-9-]{8,64}$/;

export interface SessionStore {
  get(id: string): Session | undefined;
  save(session: Session): void;
}

export function createFileSessionStore(dir: string): SessionStore {
  mkdirSync(dir, { recursive: true });
  const pathFor = (id: string) => {
    if (!SAFE_ID.test(id)) throw new Error("Invalid session id");
    return join(dir, `${id}.json`);
  };

  return {
    get(id) {
      if (!SAFE_ID.test(id)) return undefined;
      try {
        return SessionSchema.parse(JSON.parse(readFileSync(pathFor(id), "utf8")));
      } catch {
        return undefined;
      }
    },
    save(session) {
      const path = pathFor(session.id);
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(session, null, 2));
      renameSync(tmp, path);
    },
  };
}

export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, Session>();
  return {
    get: (id) => {
      const s = sessions.get(id);
      return s ? structuredClone(s) : undefined;
    },
    save: (session) => void sessions.set(session.id, structuredClone(session)),
  };
}
