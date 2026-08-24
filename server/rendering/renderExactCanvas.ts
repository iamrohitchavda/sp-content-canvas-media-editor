import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";

const FRAME_RATE = 30;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

export interface ExactCanvasRenderOptions {
  editorState: string;
  destination: string;
  frontendUrl: string;
  temporaryDirectory: string;
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

function getRenderSettings(editorState: string) {
  try {
    const document = JSON.parse(editorState) as {
      durationInFrames?: unknown;
      mediaType?: unknown;
    };
    const requestedDuration = Number(document.durationInFrames);
    return {
      isImage: document.mediaType === "image",
      durationInFrames:
        Number.isFinite(requestedDuration) && requestedDuration > 0
          ? Math.round(requestedDuration)
          : 90
    };
  } catch {
    throw new Error("The export editor state is invalid");
  }
}

async function waitForExportVideo(page: Page, timeInSeconds: number) {
  await page.evaluate(async (time) => {
    const video = document.querySelector<HTMLVideoElement>("video[data-export-video]");
    if (!video) return;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("Uploaded video could not load")), { once: true });
      });
    }
    video.pause();
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Uploaded video could not seek")), { once: true });
      video.currentTime = Math.min(time, Math.max(0, video.duration - 1 / 30));
    });

    // "seeked" means the seek operation ended, not necessarily that Chrome
    // decoded and painted the new frame. Waiting for a presented video frame
    // prevents intermittent black screenshots in the rendered MP4.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      };
      const timeout = window.setTimeout(finish, 500);
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(() => {
          window.clearTimeout(timeout);
          finish();
        });
      }
    });
  }, timeInSeconds);
}

/**
 * Screenshots the public /export page frame-by-frame. This deliberately uses
 * the same React export component as the editor, keeping the rendered result
 * aligned with the preview instead of rebuilding overlay layout in the server.
 */
export async function renderExactCanvas(options: ExactCanvasRenderOptions) {
  const { isImage, durationInFrames } = getRenderSettings(options.editorState);
  await mkdir(options.temporaryDirectory, { recursive: true });
  const framesDirectory = await mkdtemp(path.join(options.temporaryDirectory, "frames-"));
  const chromeProfileDirectory = path.join(options.temporaryDirectory, "chrome-profile");
  await mkdir(chromeProfileDirectory, { recursive: true });
  const encodedState = Buffer.from(options.editorState, "utf8").toString("base64");
  const frames = isImage ? [0] : Array.from({ length: durationInFrames }, (_, frame) => frame);
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.REVIDEO_CHROME_PATH || undefined,
    // Lambda's application directory is read-only. Keep Chrome's profile and
    // cache on the writable ephemeral disk instead.
    userDataDir: chromeProfileDirectory,
    // Send Chrome's native startup errors to CloudWatch. Puppeteer's generic
    // "session closed" message otherwise hides missing-library/OOM details.
    dumpio: true,
    // Lambda container stdout is not a dependable WebSocket discovery channel.
    // Connect over Chrome's process pipes instead of waiting for a DevTools URL.
    pipe: true,
    timeout: 60_000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--disable-crash-reporter"
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, deviceScaleFactor: 1 });
    for (const frame of frames) {
      await page.goto(
        `${options.frontendUrl}/export?frame=${frame}&data=${encodeURIComponent(encodedState)}`,
        { waitUntil: "domcontentloaded", timeout: 120_000 }
      );
      await page.evaluate(async () => document.fonts.ready);
      await waitForExportVideo(page, frame / FRAME_RATE);
      await page.screenshot({
        path: isImage
          ? options.destination
          : path.join(framesDirectory, `frame-${String(frame).padStart(3, "0")}.png`),
        clip: { x: 0, y: 0, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT }
      });
    }
  } finally {
    await browser.close();
  }

  try {
    if (!isImage) {
      await runCommand(process.env.FFMPEG_PATH || ffmpegInstaller.path, [
        "-y", "-framerate", String(FRAME_RATE),
        "-i", path.join(framesDirectory, "frame-%03d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", options.destination
      ]);
    }
  } finally {
    await rm(framesDirectory, { recursive: true, force: true });
  }
}
