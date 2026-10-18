import type { Contract } from "../../shared/schemas.ts";

export type ContractDraft = Contract;
export const EMPTY_CONTRACT: ContractDraft = { entities: "", api: "" };

const API_PLACEHOLDER = `POST /v1/urls
  body: { longUrl, customAlias? } -> { shortUrl }

GET /{shortCode} -> 302 redirect`;

/** Read-only summary once the design phase has started. */
export function ContractSummary({ contract }: { contract: Contract }) {
  return (
    <details className="statement">
      <summary>Your entities & API</summary>
      <dl className="req-summary">
        <dt>Core entities</dt>
        <dd>{contract.entities}</dd>
        <dt>API</dt>
        <dd>
          <pre className="api-pre">{contract.api}</pre>
        </dd>
      </dl>
    </details>
  );
}

interface Props {
  draft: ContractDraft;
  busy: boolean;
  readOnly: boolean;
  onDraft: (draft: ContractDraft) => void;
  onLock: () => void;
}

/** Step 2: name the nouns and the contract before drawing boxes, as real interviews expect. */
export function ContractPanel({ draft, busy, readOnly, onDraft, onLock }: Props) {
  const ready = draft.entities.trim() !== "" && draft.api.trim() !== "";
  return (
    <section className="requirements" aria-label="Core entities and API">
      <h2 className="panel-title">Step 2 · Core entities & API</h2>
      <p className="hint">
        About 5 minutes. List the main things your system stores and passes around, then the API clients call.
        Every functional requirement should map to an endpoint.
      </p>
      <label className="field">
        Core entities
        <textarea
          rows={3}
          maxLength={1000}
          value={draft.entities}
          disabled={readOnly}
          placeholder="e.g. User, ShortUrl, Click"
          onChange={(e) => onDraft({ ...draft, entities: e.target.value })}
        />
      </label>
      <label className="field">
        API <span className="muted">(REST by default; derive the user from the auth token, not the body)</span>
        <textarea
          className="api-input"
          rows={8}
          maxLength={3000}
          value={draft.api}
          disabled={readOnly}
          placeholder={API_PLACEHOLDER}
          spellCheck={false}
          onChange={(e) => onDraft({ ...draft, api: e.target.value })}
        />
      </label>
      {!readOnly && (
        <button type="button" className="btn btn--primary" disabled={!ready || busy} onClick={onLock}>
          Lock API and start designing
        </button>
      )}
      {!ready && <p className="hint">Both fields are required.</p>}
    </section>
  );
}
