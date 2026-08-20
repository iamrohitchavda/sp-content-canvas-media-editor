import Koa from "koa";
import Router from "@koa/router";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rename, stat, mkdtemp, rm } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

type Variables = Record<string, string | number | boolean>;
type Job = {
  id: string;
  status: "queued" | "rendering" | "complete" | "failed";
  variables: Variables;
  file?: string;
  error?: string;
};
const dirname = path.dirname(fileURLToPath(import.meta.url));
const exportDir = path.resolve(dirname, "../../exports");
const mediaDir = path.resolve(dirname, "../../uploads");
const jobs = new Map<string, Job>();
let queue: Promise<void> = Promise.resolve();

function command(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, { stdio: "inherit" });
    process.once("error", reject);
    process.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Command failed (${code}): ${command}`))
    );
  });
}

async function renderExactCanvas(job: Job, destination: string) {
  const editorState = job.variables.editorState;
  if (typeof editorState !== "string")
    throw new Error("The export is missing its editor state");
  let durationInFrames = 90;
  let isImageExport = false;
  try {
    const document = JSON.parse(editorState) as { durationInFrames?: unknown; mediaType?: unknown };
    isImageExport = document.mediaType === "image";
    const requestedDuration = Number(document.durationInFrames);
    // The uploaded video's metadata supplies the real frame count at 30fps.
    if (Number.isFinite(requestedDuration) && requestedDuration > 0)
      durationInFrames = Math.round(requestedDuration);
  } catch {
    throw new Error("The export editor state is invalid");
  }
  const tempDir = await mkdtemp(path.join(exportDir, "frames-"));
  const chrome =
    process.env.REVIDEO_CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const ffmpeg =
    process.env.FFMPEG_PATH ??
    path.resolve(
      dirname,
      "../../node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg"
    );
  const frontend = process.env.FRONTEND_URL ?? "http://127.0.0.1:5174";
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chrome
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    const data = Buffer.from(editorState, "utf8").toString("base64");
    const frames = isImageExport ? [0] : Array.from({ length: durationInFrames }, (_, frame) => frame);
    for (const frame of frames) {
      await page.goto(
        `${frontend}/export?frame=${frame}&data=${encodeURIComponent(data)}`,
        // A <video preload="auto"> can keep a network request open for its
        // entire duration, so networkidle0 is never a valid readiness signal.
        // The explicit seek below is the authoritative media-ready check.
        { waitUntil: "domcontentloaded", timeout: 120_000 }
      );
      // Text width controls and line wraps are only stable once the page's
      // web fonts are ready. Without this, Chrome can capture the first paint
      // in a fallback font and produce different line breaks from the editor.
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      // Video exports reuse the uploaded source. Seek the HTML video to the
      // exact frame before capturing the overlay canvas above it.
      await page.evaluate(async (time) => {
        const video = document.querySelector<HTMLVideoElement>("video[data-export-video]");
        if (!video) return;
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise<void>((resolve, reject) => {
            video.addEventListener("loadedmetadata", () => resolve(), { once: true });
            video.addEventListener("error", () => reject(new Error("Uploaded video could not load")), { once: true });
          });
        }
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("seeked", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("Uploaded video could not seek")), { once: true });
          video.currentTime = Math.min(time, Math.max(0, video.duration - 1 / 30));
        });
      }, frame / 30);
      await page.screenshot({
        path: isImageExport ? destination : path.join(tempDir, `frame-${String(frame).padStart(3, "0")}.png`),
        clip: { x: 0, y: 0, width: 1080, height: 1920 }
      });
    }
    await browser.close();
    if (isImageExport) return;
    await command(ffmpeg, [
      "-y",
      "-framerate",
      "30",
      "-i",
      path.join(tempDir, "frame-%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      destination
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function run(job: Job) {
  job.status = "rendering";
  try {
    await mkdir(exportDir, { recursive: true });
    const document = JSON.parse(String(job.variables.editorState ?? "{}")) as { mediaType?: unknown };
    const extension = document.mediaType === "image" ? "png" : "mp4";
    const destination = path.join(exportDir, `${job.id}.${extension}`);
    const workingFile = path.join(exportDir, `${job.id}.working.${extension}`);
    await renderExactCanvas(job, workingFile);
    await rename(workingFile, destination);
    job.file = destination;
    job.status = "complete";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Media render failed";
  }
}

const app = new Koa();
const router = new Router({ prefix: "/api" });
app.use(cors());
app.use(bodyParser({ jsonLimit: "1mb" }));
router.get("/health", (ctx) => {
  ctx.body = { ok: true };
});

router.post("/media", async (ctx) => {
  const contentType = ctx.get("content-type");
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) ctx.throw(415, "Choose an image or video file");
  const supplied = decodeURIComponent(ctx.get("x-filename") || "upload");
  const ext = path.extname(supplied).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 12) || (contentType.startsWith("video/") ? ".mp4" : ".png");
  await mkdir(mediaDir, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await new Promise<void>((resolve, reject) => {
    const destination = createWriteStream(path.join(mediaDir, name), { flags: "wx" });
    ctx.req.once("error", reject);
    destination.once("error", reject);
    destination.once("finish", resolve);
    ctx.req.pipe(destination);
  });
  ctx.body = { src: `http://127.0.0.1:4000/api/media/${name}` };
});

router.get("/media/:name", async (ctx) => {
  const name = path.basename(ctx.params.name);
  const file = path.join(mediaDir, name);
  try {
    const info = await stat(file);
    if (!info.isFile()) ctx.throw(404);
    const ext = path.extname(name).toLowerCase();
    const types: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
      ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    };
    ctx.type = types[ext] ?? "application/octet-stream";
    ctx.set("Accept-Ranges", "bytes");
    const range = ctx.get("range");
    if (!range) {
      ctx.length = info.size;
      ctx.body = createReadStream(file);
      return;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      ctx.throw(416, "Invalid media range");
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) ctx.throw(416, "Invalid media range");
    ctx.status = 206;
    ctx.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    ctx.length = end - start + 1;
    ctx.body = createReadStream(file, { start, end });
  } catch {
    ctx.throw(404, "Uploaded media not found");
  }
});
router.post("/renders", (ctx) => {
  console.log("Received render request", ctx.request.body);
  const variables = (ctx.request.body as { variables?: Variables })?.variables;
  if (!variables || typeof variables !== "object") {
    ctx.status = 400;
    ctx.body = { error: "variables is required" };
    return;
  }
  const job: Job = { id: randomUUID(), status: "queued", variables };
  jobs.set(job.id, job);
  queue = queue.then(() => run(job));
  ctx.status = 202;
  ctx.body = {
    id: job.id,
    status: job.status,
    statusUrl: `/api/renders/${job.id}`
  };
});
router.get("/renders/:id", (ctx) => {
  const job = jobs.get(ctx.params.id);
  if (!job) {
    ctx.status = 404;
    ctx.body = { error: "Render not found" };
    return;
  }
  ctx.body = {
    id: job.id,
    status: job.status,
    error: job.error,
    downloadUrl:
      job.status === "complete" ? `/api/renders/${job.id}/download` : undefined
  };
});
router.get("/renders/:id/download", async (ctx) => {
  const job = jobs.get(ctx.params.id);
  if (!job?.file || job.status !== "complete") {
    ctx.status = 404;
    ctx.body = { error: "Export is not ready" };
    return;
  }
  await stat(job.file);
  const image = job.file.endsWith(".png");
  ctx.type = image ? "image/png" : "video/mp4";
  ctx.attachment(`content-canvas-export.${image ? "png" : "mp4"}`);
  ctx.body = createReadStream(job.file);
});
app.use(router.routes()).use(router.allowedMethods());
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () =>
  console.log(`Koa render API listening on http://127.0.0.1:${port}`)
);
