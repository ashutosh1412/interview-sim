import type { Assessment } from "../../shared/schemas.ts";

const VERDICT: Record<Assessment["verdict"], string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  lean_hire: "Lean hire",
  lean_no_hire: "Lean no hire",
  no_hire: "No hire",
};

export function AssessmentView({ assessment, onClose }: { assessment: Assessment; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
      <div className="modal__card">
        <h2 id="assessment-title">Final assessment</h2>
        <p className={`verdict verdict--${assessment.verdict}`}>{VERDICT[assessment.verdict]}</p>
        <p>{assessment.summary}</p>
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
