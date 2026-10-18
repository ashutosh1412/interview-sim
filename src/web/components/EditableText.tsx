import { useEffect, useRef } from "react";

interface Props {
  value: string;
  editing: boolean;
  multiline?: boolean;
  maxLength: number;
  placeholder: string;
  className?: string;
  style?: React.CSSProperties;
  onChange: (value: string) => void;
  onDone: () => void;
}

/**
 * Text that turns into an input on double-click, like draw.io. Changes apply live;
 * Enter (without Shift in multi-line mode), Escape or clicking away finishes.
 */
export function EditableText({ value, editing, multiline, maxLength, placeholder, className, style, onChange, onDone }: Props) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    ref.current?.focus();
    ref.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <div className={className} style={style}>
        {value || <span className="placeholder">{placeholder}</span>}
      </div>
    );
  }

  const common = {
    ref,
    value,
    maxLength,
    placeholder,
    // nodrag/nopan: typing and selecting text must not move the node or the canvas.
    className: `inline-edit nodrag nopan ${className ?? ""}`,
    style,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: onDone,
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation(); // keep Backspace from deleting the node
      if (e.key === "Escape" || (e.key === "Enter" && !(multiline && e.shiftKey))) {
        e.preventDefault();
        onDone();
      }
    },
  };
  return multiline ? <textarea rows={3} {...common} /> : <input {...common} />;
}
