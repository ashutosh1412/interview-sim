import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import { currentChoice, stableEnds, type DesignFlowEdge, type DirectionChoice } from "../graph.ts";

type EdgeLike = Pick<DesignFlowEdge, "source" | "target" | "data">;

interface Props {
  edge: EdgeLike;
  nameOf: (nodeId: string) => string;
  disabled?: boolean;
  onChange: (choice: DirectionChoice) => void;
}

/** Three explicit options with both component names, so the arrow's meaning is never a guess. */
export function DirectionPicker({ edge, nameOf, disabled, onChange }: Props) {
  const [a, b] = stableEnds(edge).map(nameOf);
  const value = currentChoice(edge);
  const options = [
    { choice: "forward", Icon: ArrowRight, hint: `${a} calls ${b}` },
    { choice: "backward", Icon: ArrowLeft, hint: `${b} calls ${a}` },
    { choice: "both", Icon: ArrowLeftRight, hint: "Both call each other" },
  ] as const;

  return (
    <div className="direction-picker" role="radiogroup" aria-label="Direction">
      {options.map(({ choice, Icon, hint }) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={value === choice}
          className={`direction-picker__option${value === choice ? " is-on" : ""}`}
          disabled={disabled}
          title={hint}
          onClick={() => onChange(choice)}
        >
          <span className="direction-picker__end">{a}</span>
          <Icon size={16} aria-hidden="true" />
          <span className="direction-picker__end">{b}</span>
        </button>
      ))}
    </div>
  );
}
