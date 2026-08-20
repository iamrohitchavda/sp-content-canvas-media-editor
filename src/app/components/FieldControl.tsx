import type { ReactNode } from "react";
import type { FieldDef } from "../templates/schema";
import { sp, radius, type, FONT } from "../theme";
import { normalizeFeel } from "./AnimationPlayer";
import { Field, TextInput, TextArea, Select, ColorInput, PillSelect } from "./ds";

/**
 * Above this length a value is prose and gets Input-Text Area; below it, a
 * single line and gets Input-Text Single. A 120px box for "Customer Name" would
 * be wrong even though both are "text".
 */
const MULTILINE_ABOVE = 40;

interface Props {
  field: FieldDef;
  value: string | number;
  onChange: (key: string, value: string | number) => void;
  hideLabel?: boolean;
}

export function FieldControl({ field, value, onChange, hideLabel = false }: Props) {
  const id = `field-${field.key}`;
  const wrap = (children: ReactNode, hint?: ReactNode, hintTone?: "muted" | "danger" | "brand") => {
    if (hideLabel) return children;
    return (
      <Field label={field.label} hint={hint} hintTone={hintTone} htmlFor={id}>
        {children}
      </Field>
    );
  };

  if (field.type === "select") {
    const raw = String(value ?? field.default);
    const current = field.key === "animationStyle" ? normalizeFeel(raw) : raw;
    if (field.variant === "pills") {
      return wrap(
        <PillSelect
          value={current}
          options={field.options}
          onChange={(next) => onChange(field.key, next)}
        />
      );
    }
    return wrap(
      <Select
        id={id}
        value={current}
        options={field.options}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    );
  }

  if (field.type === "number") {
    const num = Number(value);
    const pct = ((num - field.min) / (field.max - field.min)) * 100;
    return wrap(
      <>
        <input
          id={id}
          type="range"
          min={field.min}
          max={field.max}
          value={num}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
          style={{
            width: "100%",
            height: "4px",
            appearance: "none",
            cursor: "pointer",
            borderRadius: radius[2],
            background: `linear-gradient(to right, ${sp.blue} ${pct}%, ${sp.track} ${pct}%)`,
            accentColor: sp.blue,
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: FONT,
            fontSize: type.xs.size,
            lineHeight: type.xs.line,
            color: sp.textTertiary,
          }}
        >
          <span>{field.min}</span>
          <span>{field.max}</span>
        </div>
      </>
    );
  }

  if (field.type === "text") {
    const str = String(value);
    const nearLimit = field.maxLength - str.length <= 10;
    return wrap(
      <>
        {field.maxLength > MULTILINE_ABOVE ? (
          <TextArea
            id={id}
            value={str}
            maxLength={field.maxLength}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        ) : (
          <TextInput
            id={id}
            type="text"
            value={str}
            maxLength={field.maxLength}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        )}
      </>,
      field.showCount === false ? undefined : `${str.length}/${field.maxLength}`,
      nearLimit ? "danger" : "muted",
    );
  }

  if (field.type === "color") {
    if (hideLabel) return <ColorInput value={String(value)} onChange={(hex) => onChange(field.key, hex)} />;
    return (
      <Field label={field.label}>
        <ColorInput value={String(value)} onChange={(hex) => onChange(field.key, hex)} />
      </Field>
    );
  }

  return null;
}
