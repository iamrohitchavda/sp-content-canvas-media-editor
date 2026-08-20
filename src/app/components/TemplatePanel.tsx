import type { TemplateDef } from "../templates/schema";
import { templates } from "../templates/index";
import { sp, FONT } from "../theme";
import { TabLabel } from "./TabLabel";

/** Glance icon size. */
const THUMB = 24;

/**
 * A bare icon, rather than a live-rendered crop of the template applied to
 * the post's photo. At list size a cropped 9:16 composition reads as noise —
 * the badge, the text, the confetti all blur into an indistinct smear of the
 * same photo repeated six times. A tinted background tile was a step in the
 * right direction but still competed with the name for attention; the emoji
 * alone is legible and quiet enough to sit beside it.
 */
function TemplateThumb({
  template,
  isActive,
  onSelect,
}: {
  template: TemplateDef;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      title={template.name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "4px",
        border: "none",
        borderRadius: "6px",
        background: isActive ? sp.bg : "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONT,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: `${THUMB}px`,
          height: `${THUMB}px`,
          flexShrink: 0,
          fontSize: "16px",
          lineHeight: 1,
        }}
      >
        {template.icon}
      </div>
      <span
        style={{
          fontSize: "13px",
          lineHeight: "18px",
          fontWeight: 400,
          color: isActive ? sp.textPrimary : sp.textSecondary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {template.name}
      </span>
    </button>
  );
}

export function TemplatePanel({
  activeTemplateId,
  onSelect,
}: {
  activeTemplateId: string | null;
  onSelect: (template: TemplateDef) => void;
}) {
  return (
    <div
      style={{
        width: "240px",
        flexShrink: 0,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "12px",
        background: sp.white,
        borderRight: `1px solid ${sp.borderSub}`,
        overflow: "hidden",
      }}
    >
      {/* Header — the design's close control is opacity-0, so it is not shown. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          width: "100%",
          height: "32px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <TabLabel>Templates</TabLabel>
          <span style={{ fontSize: "10px", color: sp.textTertiary }}>Click to add to your canvas</span>
        </div>
      </div>

      <div
        className="scroll-area"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {templates.map((t) => (
          <TemplateThumb
            key={t.id}
            template={t}
            isActive={t.id === activeTemplateId}
            onSelect={() => onSelect(t)}
          />
        ))}
      </div>
    </div>
  );
}
