import { useState } from "react";
import type { TemplateDef, TemplateState, PostCopy } from "./templates/schema";
import { EditMediaModal } from "./components/EditMediaModal";
import type { MediaItem, MediaType } from "./components/MediaPreview";
import { sp, FONT } from "./theme";
import { ExportCanvas } from "./ExportCanvas";

const EMPTY_MEDIA: MediaItem = { id: "empty", src: "", alt: "" };
const RENDER_API_URL = "http://127.0.0.1:4000/api";
const FRAMES_PER_SECOND = 30;
const DEFAULT_VIDEO_DURATION_IN_FRAMES = 300;
/** Set VITE_DEMO_MODE=true on Vercel for a browser-only design demo. */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * Copy the AI already wrote for this post, upstream in the content canvas.
 * Templates bind their main line to this, so the editor never asks the user to
 * write something that already exists. Hardcoded here as a stand-in.
 */
const DEFAULT_POST_COPY: PostCopy = {
  headline: "Limited edition release",
  hook: "The best pieces sell out in hours",
  cta: "Let's Go"
};

const TEMPLATE_RENDER_NAMES: Record<string, string> = {
  "five-star-rating": "rating",
  "summer-sale": "offer",
  "grand-opening": "opening",
  "pro-tip": "tip",
  "find-us": "location"
};

type ExportStatus = "idle" | "rendering" | "complete" | "failed";

interface ExportState {
  status: ExportStatus;
  format?: MediaType;
  downloadUrl?: string;
  error?: string;
}

function getMediaType(file: File): MediaType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readVideoDurationInFrames(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Math.max(1, Math.round(video.duration * FRAMES_PER_SECOND)));
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the video duration"));
    };
    video.src = objectUrl;
  });
}

export default function App() {
  if (window.location.pathname === "/export") return <ExportCanvas />;
  const [open, setOpen] = useState(true);
  const [media, setMedia] = useState<MediaItem>(EMPTY_MEDIA);
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  const handleSave = async (
    template: TemplateDef | null,
    state: TemplateState
  ) => {
    if (DEMO_MODE) return;
    if (!template || !media.src) return;
    const values = state.values;
    const variables = {
      template: TEMPLATE_RENDER_NAMES[template.id] ?? "rating",
      headline: String(
        values.address ??
          values.reviewText ??
          values.headline ??
          values.businessName ??
          values.tipText ??
          DEFAULT_POST_COPY.headline
      ),
      hook: String(
        values.hours ??
          values.customerName ??
          values.tagline ??
          values.message ??
          values.tipDetail ??
          DEFAULT_POST_COPY.hook
      ),
      cta: String(
        values.phone ??
          values.date ??
          values.ctaText ??
          values.tagline ??
          DEFAULT_POST_COPY.cta
      ),
      accent: String(values.accentColor ?? template.previewColor),
      background: "#171720",
      mediaSrc: media.src,
      stars: String(values.rating ?? 5),
      discount: String(values.discount ?? 30),
      badge: String(values.badge ?? "Now Open"),
      tipNumber: String(values.tipNumber ?? 1),
      fontSize: "96",
      showBadge: "true",
      // Preserve the complete editor document for the exact-canvas exporter:
      // placement, visibility, duplicates, typography and per-layer motion.
      // The demo treats its current media as a ten-second video. This makes
      // element timing part of the document sent to the exact-canvas exporter.
      // Images retain the template's one settled/static frame instead.
      editorState: JSON.stringify({
        templateId: template.id,
        state,
        media,
        mediaType,
        durationInFrames:
          mediaType === "video"
            ? (media.durationInFrames ?? DEFAULT_VIDEO_DURATION_IN_FRAMES)
            : template.durationInFrames
      })
    };
    setExportState({ status: "rendering", format: mediaType });
    try {
      const start = await fetch(`${RENDER_API_URL}/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables })
      });
      if (!start.ok) throw new Error("Could not start the export");
      const { id } = (await start.json()) as { id: string };
      const poll = async (): Promise<void> => {
        const response = await fetch(`${RENDER_API_URL}/renders/${id}`);
        const job = (await response.json()) as {
          status: string;
          error?: string;
          downloadUrl?: string;
        };
        if (job.status === "complete" && job.downloadUrl) {
          setExportState({
            status: "complete",
            format: mediaType,
            downloadUrl: `http://127.0.0.1:4000${job.downloadUrl}`
          });
          return;
        }
        if (job.status === "failed") {
          setExportState({
            status: "failed",
            error: job.error ?? "Export failed"
          });
          return;
        }
        window.setTimeout(poll, 1000);
      };
      void poll();
    } catch (error) {
      setExportState({
        status: "failed",
        error: getErrorMessage(error, "Export failed")
      });
    }
  };

  const handleUploadMedia = async (file: File) => {
    const type = getMediaType(file);
    if (!type) {
      setExportState({
        status: "failed",
        error: "Please choose an image or video file"
      });
      return;
    }
    // Give immediate feedback while the Koa upload is being persisted. The
    // local preview is replaced by a server URL once export can use it.
    const localPreview = URL.createObjectURL(file);
    setMedia({ id: crypto.randomUUID(), src: localPreview, alt: file.name });
    setMediaType(type);
    setExportState({ status: "rendering" });
    try {
      const durationInFrames = type === "video" ? await readVideoDurationInFrames(file) : undefined;
      // Static hosting has no Koa upload service or persistent disk. Keep the
      // browser object URL for this tab so visitors can test their own media
      // with the full editor and timeline, without attempting an export.
      if (DEMO_MODE) {
        setMedia({
          id: crypto.randomUUID(),
          src: localPreview,
          alt: file.name,
          durationInFrames
        });
        setMediaType(type);
        setExportState({ status: "idle" });
        return;
      }
      const response = await fetch(`${RENDER_API_URL}/media`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-Filename": encodeURIComponent(file.name)
        },
        body: file
      });
      if (!response.ok) throw new Error(await response.text());
      const uploaded = (await response.json()) as { src: string };
      URL.revokeObjectURL(localPreview);
      setMedia({
        id: crypto.randomUUID(),
        src: uploaded.src,
        alt: file.name,
        durationInFrames
      });
      setMediaType(type);
      setExportState({ status: "idle" });
    } catch (error) {
      setExportState({
        status: "failed",
        error: `Upload failed: ${getErrorMessage(error, "start the Koa server and try again")}`
      });
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        fontFamily: FONT,
        background: sp.bg
      }}
    >
      {open && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(24,24,26,0.64)",
              zIndex: 10
            }}
          />
          <EditMediaModal
            media={media}
            mediaType={mediaType}
            post={DEFAULT_POST_COPY}
            onClose={() => setOpen(false)}
            onSave={handleSave}
            onUploadMedia={handleUploadMedia}
            demoMode={DEMO_MODE}
          />
        </>
      )}
      {exportState.status !== "idle" && (
        <div
          style={{
            position: "absolute",
            right: 24,
            bottom: 24,
            zIndex: 30,
            padding: "14px 16px",
            borderRadius: 8,
            background: "white",
            boxShadow: "0 8px 28px rgba(0,0,0,.2)",
            color: sp.textPrimary
          }}
        >
          {exportState.status === "rendering" &&
            `Rendering your ${exportState.format === "image" ? "image" : "video"}…`}
          {exportState.status === "failed" &&
            `Export failed: ${exportState.error}`}
          {exportState.status === "complete" && (
            <a
              href={exportState.downloadUrl}
              style={{ color: sp.blue, fontWeight: 600 }}
            >
              Download {exportState.format === "image" ? "PNG" : "MP4"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
