import { sp, FONT } from "../theme";

/**
 * SocialPilot "Tab Base": 14px regular label over a gold indicator bar.
 *
 * The modal header and the side-panel headings use the same component with
 * different indicator weights — 4px in the header, 1px on the panels.
 */
export function TabLabel({
  children,
  variant = "panel",
}: {
  children: string;
  variant?: "header" | "panel";
}) {
  const isHeader = variant === "header";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: isHeader ? "2px" : "4px",
        height: isHeader ? "32px" : "26px",
        justifyContent: "flex-end",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "0 8px", flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontFamily: FONT,
            fontSize: "14px",
            fontWeight: 400,
            lineHeight: "18px",
            color: sp.textPrimary,
            whiteSpace: "nowrap",
          }}
        >
          {children}
        </p>
      </div>
      <div
        style={{
          width: "100%",
          height: isHeader ? "4px" : "1px",
          background: sp.gold,
          flexShrink: 0,
        }}
      />
    </div>
  );
}
