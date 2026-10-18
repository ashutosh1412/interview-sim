import type { Contract } from "../../shared/schemas.ts";

export type ContractDraft = Contract;
export const EMPTY_CONTRACT: ContractDraft = { entities: "", api: "" };

const TEXT = {
  hld: {
    step: "Step 2 · Core entities & API",
    hint: "The main things your system stores, and the calls clients make.",
    entities: "Core entities",
    entitiesPlaceholder: "e.g. User, ShortUrl, Click",
    api: "API",
    apiPlaceholder: `POST /v1/urls
  body: { longUrl, customAlias? } -> { shortUrl }

GET /{shortCode} -> 302 redirect`,
  },
  lld: {
    step: "Step 2 · Core classes & methods",
    hint: "The main classes, and the public methods other code calls.",
    entities: "Core classes",
    entitiesPlaceholder: "e.g. ParkingLot, Floor, Spot, Vehicle, Ticket",
    api: "Key methods",
    apiPlaceholder: `ParkingLot.park(vehicle): Ticket
ParkingLot.leave(ticket): Payment`,
  },
} as const;

/** Read-only summary of the locked entities and API. */
export function ContractSummary({ contract, kind }: { contract: Contract; kind: "hld" | "lld" }) {
  return (
    <dl className="req-summary">
      <dt>{TEXT[kind].entities}</dt>
      <dd>{contract.entities}</dd>
      <dt>{TEXT[kind].api}</dt>
      <dd>
        <pre className="api-pre">{contract.api}</pre>
      </dd>
    </dl>
  );
}

interface Props {
  kind: "hld" | "lld";
  draft: ContractDraft;
  busy: boolean;
  readOnly: boolean;
  onDraft: (draft: ContractDraft) => void;
  onLock: () => void;
}

/** Step 2: name the nouns and the contract before drawing boxes, as real interviews expect. */
export function ContractPanel({ kind, draft, busy, readOnly, onDraft, onLock }: Props) {
  const t = TEXT[kind];
  const ready = draft.entities.trim() !== "" && draft.api.trim() !== "";
  return (
    <section className="requirements" aria-label="Core entities and API">
      <h2 className="panel-title">{t.step}</h2>
      <p className="hint">{t.hint}</p>
      <label className="field">
        {t.entities}
        <textarea
          rows={3}
          maxLength={1000}
          value={draft.entities}
          disabled={readOnly}
          placeholder={t.entitiesPlaceholder}
          onChange={(e) => onDraft({ ...draft, entities: e.target.value })}
        />
      </label>
      <label className="field">
        {t.api}
        <textarea
          className="api-input"
          rows={8}
          maxLength={3000}
          value={draft.api}
          disabled={readOnly}
          placeholder={t.apiPlaceholder}
          spellCheck={false}
          onChange={(e) => onDraft({ ...draft, api: e.target.value })}
        />
      </label>
      {!readOnly && (
        <button type="button" className="btn btn--primary" disabled={!ready || busy} onClick={onLock}>
          Lock and start designing
        </button>
      )}
      {!ready && <p className="hint">Both fields are required.</p>}
    </section>
  );
}
