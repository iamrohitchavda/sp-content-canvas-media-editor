import type { ReactNode } from "react";
import { sp } from "../theme";

/**
 * 32x32 icon button — the design reuses one component for the modal close, the
 * panel close, and the customize reset.
 */
export function IconButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: "32px",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "none",
        borderRadius: "4px",
        background: "none",
        color: disabled ? sp.textDisabled : sp.iconSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = sp.surface2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
      }}
    >
      {children}
    </button>
  );
}
