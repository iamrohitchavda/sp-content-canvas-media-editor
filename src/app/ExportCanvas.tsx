import { EditableCanvas } from "./components/EditableCanvas";
import { blankTemplate, templates } from "./templates";
import type { TemplateState } from "./templates/schema";
import { FONT } from "./theme";

type ExportData = {
  templateId: string;
  state: TemplateState;
  durationInFrames?: number;
  media?: { src: string; alt: string; durationInFrames?: number };
  mediaType?: "image" | "video";
};

function readData(): ExportData | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("data");
    return raw ? JSON.parse(atob(raw)) as ExportData : null;
  } catch { return null; }
}

/**
 * A clean, full-resolution version of the actual editor canvas. The backend
 * captures this route frame-by-frame, so export reuses the very same React
 * layer tree, SVG art, duplicate elements, positions and CSS motion as the
 * preview rather than attempting to recreate it with a second layout.
 */
export function ExportCanvas() {
  const data = readData();
  const frame = Number(new URLSearchParams(window.location.search).get("frame") ?? 89);
  const template = [...templates, blankTemplate].find((item) => item.id === data?.templateId);
  if (!template || !data) return <div>Invalid export data</div>;
  const noop = () => {};
  return <div style={{ margin: 0, width: 1080, height: 1920, overflow: "hidden", position: "relative", background: "#000", fontFamily: FONT }}>
    {data.mediaType === "video" ? <video data-export-video src={data.media?.src} muted playsInline preload="auto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <img src={data.media?.src} alt={data.media?.alt ?? ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    <EditableCanvas
      template={template}
      state={data.state}
      boxW={1080}
      boxH={1920}
      selectedId={null}
      onSelect={noop}
      onMove={noop}
      onEditText={noop}
      onEditExtraText={noop}
      onToggleLayer={noop}
      onResizeText={noop}
      onDuplicate={noop}
      onDelete={noop}
      previewFrame={data.mediaType === "image" ? template.durationInFrames - 1 : Math.max(0, frame)}
    />
  </div>;
}
