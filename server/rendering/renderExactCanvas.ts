import path from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import puppeteer from "puppeteer";

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
      media?: { src?: unknown };
    };
    const requestedDuration = Number(document.durationInFrames);
    return {
      isImage: document.mediaType === "image",
      mediaSource: typeof document.media?.src === "string" ? document.media.src : "",
      durationInFrames:
        Number.isFinite(requestedDuration) && requestedDuration > 0
          ? Math.round(requestedDuration)
          : 90
    };
  } catch {
    throw new Error("The export editor state is invalid");
  }
}

/**
 * Screenshots the public /export page frame-by-frame. The page is opened once
 * and React updates its frame in place, avoiding a full navigation for every
 * frame while still using the exact same layer tree as the editor.
 */
export async function renderExactCanvas(options: ExactCanvasRenderOptions) {
  const { isImage, mediaSource, durationInFrames } = getRenderSettings(options.editorState);
  if (!isImage && !mediaSource) throw new Error("The export is missing its video source");
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
    await page.goto(
      `${options.frontendUrl}/export?frame=0&overlay=${isImage ? "0" : "1"}&data=${encodeURIComponent(encodedState)}`,
      { waitUntil: "domcontentloaded", timeout: 120_000 }
    );
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(
      () => typeof (window as Window & { __contentCanvasSetFrame?: unknown }).__contentCanvasSetFrame === "function",
      { timeout: 30_000 }
    );

    for (const frame of frames) {
      await page.evaluate(async (nextFrame) => {
        const setFrame = (window as Window & {
          __contentCanvasSetFrame?: (frame: number) => Promise<void>;
        }).__contentCanvasSetFrame;
        if (!setFrame) throw new Error("The export canvas frame bridge is unavailable");
        await setFrame(nextFrame);
      }, frame);
      await page.screenshot({
        path: isImage
          ? options.destination
          : path.join(framesDirectory, `frame-${String(frame).padStart(3, "0")}.png`),
        clip: { x: 0, y: 0, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT },
        omitBackground: !isImage
      });
    }
  } finally {
    await browser.close();
  }

  try {
    if (!isImage) {
      await runCommand(process.env.FFMPEG_PATH || ffmpegInstaller.path, [
        "-y",
        "-i", mediaSource,
        "-framerate", String(FRAME_RATE),
        "-i", path.join(framesDirectory, "frame-%03d.png"),
        "-filter_complex",
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[base];[1:v]format=rgba[overlay];[base][overlay]overlay=0:0:format=auto[video]",
        "-map", "[video]",
        "-map", "0:a?",
        "-t", String(durationInFrames / FRAME_RATE),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-shortest",
        options.destination
      ]);
    }
  } finally {
    await rm(framesDirectory, { recursive: true, force: true });
  }
}
