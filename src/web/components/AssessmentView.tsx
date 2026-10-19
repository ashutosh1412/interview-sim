import { CONCEPTS, type ConceptId, type ConceptLevel } from "../../shared/concepts.ts";
import type { Assessment, Session } from "../../shared/schemas.ts";

const VERDICT: Record<Assessment["verdict"], string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  lean_hire: "Lean hire",
  lean_no_hire: "Lean no hire",
  no_hire: "No hire",
};

const LEVEL: Record<ConceptLevel, string> = {
  untested: "Not reached",
  none: "Not shown",
  surface: "Surface",
  solid: "Solid",
  deep: "Deep",
};

interface Props {
  assessment: Assessment;
  outcome: Session["outcome"];
  knowledge: Session["knowledge"];
  onClose: () => void;
}

export function AssessmentView({ assessment, outcome, knowledge, onClose }: Props) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
      <div className="modal__card">
        <h2 id="assessment-title">Final assessment</h2>

        {outcome && (
          <div className={`result result--${outcome.passed ? "pass" : "fail"}`}>
            <p className="result__title">{outcome.passed ? "Passed" : "Not passed"}</p>
            {!outcome.passed && (
              <ul>
                {outcome.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p>
          <span className={`verdict verdict--${assessment.verdict}`}>{VERDICT[assessment.verdict]}</span> · {assessment.summary}
        </p>

        {knowledge.length > 0 && (
          <>
            <h3>Knowledge check</h3>
            <table className="scores scores--knowledge">
              <tbody>
                {knowledge.map((k) => {
                  const c = CONCEPTS[k.concept as ConceptId];
                  return (
                    <tr key={k.concept}>
                      <th scope="row">
                        {c.title}
                        <div className="muted small">{c.ref}</div>
                      </th>
                      <td>
                        <span className={`level level--${k.level}`}>{LEVEL[k.level]}</span>
                      </td>
                      <td>{k.evidence || <span className="muted">No evidence</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <h3>Scores</h3>
        <table className="scores">
          <tbody>
            {assessment.scores.map((s) => (
              <tr key={s.dimension}>
                <th scope="row">{s.dimension.replaceAll("_", " ")}</th>
                <td className="scores__value">
                  <span className="meter" aria-label={`${s.score} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={n <= s.score ? "on" : ""} />
                    ))}
                  </span>
                </td>
                <td>{s.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {assessment.missed.length > 0 && (
          <>
            <h3>What a strong answer would add</h3>
            <ul>
              {assessment.missed.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Back to my design
        </button>
      </div>
    </div>
  );
}
