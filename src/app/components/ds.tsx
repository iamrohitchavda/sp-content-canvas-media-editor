import { useState } from "react";
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from "react";
import { sp, space, radius, type, FONT } from "../theme";

/**
 * SocialPilot form primitives.
 *
 * Specs come from the Design System - Web library (file O87peGRdJA15qba27qOB20,
 * page "Inputs"), read off the real component sets rather than inferred:
 *
 *   Input-Text Single  13662:44321  h32, px8,  radius 2
 *   Input-Dropdown     13702:49886  h32, pl8/pr4, radius 2
 *   Input-Text Area    13702:53146  h120, p16, radius 2
 *
 * State colours are shared across all three:
 *   default   fill surface/input-primary   border border/input-secondary
 *   hover     fill surface/input-hover     border border/input-secondary
 *   active    fill surface/input-active    border border/input-active
 *   disabled  fill surface/input-primary-disabled  border border/input-secondary-disabled
 *   error     fill surface/input-primary   border border/danger
 *
 * These are local implementations: the design system publishes Figma components
 * and CSS tokens, but no React package. This file is the single seam to swap if
 * one ever ships.
 */

type Visual = { focused: boolean; disabled?: boolean; invalid?: boolean };

function surface({ focused, disabled, invalid }: Visual) {
  if (disabled) return { background: sp.inputDisabled, borderColor: sp.borderInputDisabled };
  if (invalid) return { background: sp.inputBg, borderColor: sp.borderDanger };
  if (focused) return { background: sp.inputActive, borderColor: sp.borderActive };
  return { background: sp.inputBg, borderColor: sp.borderInput };
}

const shared = {
  width: "100%",
  boxSizing: "border-box" as const,
  borderRadius: radius[2],
  borderWidth: "1px",
  borderStyle: "solid" as const,
  color: sp.textPrimary,
  fontFamily: FONT,
  fontSize: type.s.size,
  lineHeight: type.s.line,
  fontWeight: 400,
  outline: "none",
  transition: "background-color 0.12s, border-color 0.12s",
};

/**
 * Label row above a control. The library's label is 14px *regular* (not
 * semibold), with a 4px gap to any trailing adornment and 8px to the control.
 */
export function Field({
  label,
  hint,
  hintTone = "muted",
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  hintTone?: "muted" | "danger" | "brand";
  htmlFor?: string;
  children: ReactNode;
}) {
  const hintColor =
    hintTone === "danger" ? sp.danger : hintTone === "brand" ? sp.blue : sp.textTertiary;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[8], fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space[4] }}>
        <label
          htmlFor={htmlFor}
          style={{ fontSize: type.s.size, lineHeight: type.s.line, fontWeight: 400, color: sp.textPrimary }}
        >
          {label}
        </label>
        {hint !== undefined && (
          <span
            style={{
              fontSize: type.xs.size,
              lineHeight: type.xs.line,
              color: hintColor,
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Input-Text Single — 32px tall, 8px horizontal padding. */
export function TextInput({
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const v = surface({ focused, disabled: props.disabled, invalid });
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); props.onMouseLeave?.(e); }}
      style={{
        ...shared,
        height: "32px",
        padding: `0 ${space[8]}`,
        ...v,
        ...(hover && !focused && !props.disabled && !invalid ? { background: sp.inputHover } : null),
        ...props.style,
      }}
    />
  );
}

/** Input-Text Area — 16px padding, 120px tall. */
export function TextArea({
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const v = surface({ focused, disabled: props.disabled, invalid });
  return (
    <textarea
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); props.onMouseLeave?.(e); }}
      style={{
        ...shared,
        minHeight: "96px",
        padding: space[16],
        resize: "none",
        ...v,
        ...(hover && !focused && !props.disabled && !invalid ? { background: sp.inputHover } : null),
        ...props.style,
      }}
    />
  );
}

/** Pill choice row — options visible at a glance, no dropdown. */
export function PillSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: space[8] }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            style={{
              height: "32px",
              padding: `0 ${space[12]}`,
              borderRadius: radius[16],
              border: `1px solid ${selected ? sp.borderActive : sp.borderSub}`,
              background: selected ? sp.blueSubtle : sp.white,
              color: selected ? sp.blue : sp.textPrimary,
              fontFamily: FONT,
              fontSize: type.s.size,
              lineHeight: type.s.line,
              fontWeight: 400,
              cursor: "pointer",
              transition: "background-color 0.12s, border-color 0.12s, color 0.12s",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented tab switcher — same track as the library's own tab-container
 * (`surface/primary` fill, `border/secondary` 1px edge, 4px radius, no
 * padding or gaps, segments flush against each other and clipped to the
 * track's corners) rather than an invented style. Reserved for top-level view
 * switches (e.g. an inspector's Properties/Motion tabs) where a row of
 * separate pill buttons reads as multiple choices rather than one either/or
 * toggle.
 */
export function SegmentedTabs({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: space[4],
        padding: space[2],
        // A flex item with non-visible overflow gets an automatic minimum
        // size of 0 (the flexbox spec's special case), so this row was
        // getting shrunk to nothing — clipped to just its own borders —
        // whenever the properties list above it in the same flex column ran
        // long enough to need shrinking. `flexShrink: 0` keeps this row at
        // its own content height no matter what its siblings do.
        flexShrink: 0,
        borderRadius: radius[4],
        border: `1px solid ${sp.borderInput}`,
        background: sp.inputBg,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            style={{
              flex: 1,
              height: "24px",
              border: "none",
              borderRadius: radius[4],
              background: selected ? sp.inputActive : "transparent",
              boxShadow: selected ? "0px 8px 12px rgba(0,0,0,0.12)" : "none",
              color: selected ? sp.textPrimary : sp.textSecondary,
              fontFamily: FONT,
              fontSize: type.xs.size,
              lineHeight: type.xs.line,
              fontWeight: 400,
              cursor: "pointer",
              transition: "background-color 0.12s, color 0.12s, box-shadow 0.12s",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Input-Dropdown — 32px tall, 8px left / 4px right for the chevron. */
export function Select({
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const v = surface({ focused, disabled: props.disabled });
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        onMouseEnter={(e) => { setHover(true); props.onMouseEnter?.(e); }}
        onMouseLeave={(e) => { setHover(false); props.onMouseLeave?.(e); }}
        style={{
          ...shared,
          height: "32px",
          paddingLeft: space[8],
          paddingRight: space[24],
          appearance: "none",
          cursor: "pointer",
          ...v,
          ...(hover && !focused && !props.disabled ? { background: sp.inputHover } : null),
          ...props.style,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{ position: "absolute", right: space[4], top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
      >
        <path d="M4 6.5L8 10.5L12 6.5" stroke={sp.iconSecondary} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Colour control, per the library's Input-Text Single "Filled" instance: one
 * 32px input surface with the swatch inside on the left and the hex value
 * (shown without the #) beside it. Clicking the swatch opens the native
 * colour picker.
 */
export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const v = surface({ focused });
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...shared,
        display: "flex",
        alignItems: "center",
        gap: space[8],
        height: "32px",
        padding: `0 ${space[8]}`,
        ...v,
        ...(hover && !focused ? { background: sp.inputHover } : null),
      }}
    >
      <div
        style={{
          position: "relative",
          width: "20px",
          height: "20px",
          flexShrink: 0,
          borderRadius: radius[2],
          overflow: "hidden",
        }}
      >
        <input
          type="color"
          aria-label="Colour"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute",
            inset: "-4px",
            width: "calc(100% + 8px)",
            height: "calc(100% + 8px)",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        />
      </div>
      <input
        type="text"
        aria-label="Hex value"
        value={value.replace(/^#/, "").toUpperCase()}
        maxLength={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/^#/, "");
          if (/^[0-9A-Fa-f]{0,6}$/.test(raw)) onChange("#" + raw.toLowerCase());
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          border: "none",
          background: "none",
          outline: "none",
          padding: 0,
          color: sp.textPrimary,
          fontFamily: FONT,
          fontSize: type.s.size,
          lineHeight: type.s.line,
        }}
      />
    </div>
  );
}
