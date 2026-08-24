import { randomUUID } from "node:crypto";
import path from "node:path";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from "aws-lambda";
import { renderExactCanvas } from "../rendering/renderExactCanvas.js";

const s3 = new S3Client({});
const SIGNED_UPLOAD_SECONDS = 5 * 60;
const SIGNED_DOWNLOAD_SECONDS = 15 * 60;
const RENDER_TEMPORARY_DIRECTORY = "/tmp/content-canvas";

type ExportDocument = {
  mediaType?: unknown;
  media?: Record<string, unknown>;
};

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function response(statusCode: number, body: unknown): LambdaFunctionURLResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": process.env.ALLOWED_ORIGIN ?? "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: JSON.stringify(body)
  };
}

function readJsonBody(event: LambdaFunctionURLEvent) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) as Record<string, unknown>;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function isAllowedContentType(contentType: string) {
  return contentType.startsWith("image/") || contentType.startsWith("video/");
}

function safeExtension(filename: string, contentType: string) {
  const extension = path.extname(filename).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 12);
  if (extension) return extension.toLowerCase();
  return contentType.startsWith("video/") ? ".mp4" : ".png";
}

function validUploadKey(value: unknown): value is string {
  return typeof value === "string" && /^uploads\/[a-f0-9-]+\.[a-z0-9]+$/i.test(value);
}

function getExportDocument(value: unknown): ExportDocument {
  if (typeof value !== "string") throw new Error("editorState must be a JSON string");
  try {
    const document = JSON.parse(value) as ExportDocument;
    if (!document || typeof document !== "object") throw new Error();
    return document;
  } catch {
    throw new Error("editorState is invalid");
  }
}

async function createUploadUrl(body: Record<string, unknown>) {
  const filename = typeof body.filename === "string" ? body.filename : "upload";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  if (!isAllowedContentType(contentType)) throw new Error("Choose an image or video file");
  const key = `uploads/${randomUUID()}${safeExtension(filename, contentType)}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: requiredEnvironment("MEDIA_BUCKET"),
      Key: key,
      ContentType: contentType
    }),
    { expiresIn: SIGNED_UPLOAD_SECONDS }
  );
  return { uploadUrl, key, expiresInSeconds: SIGNED_UPLOAD_SECONDS };
}

async function renderAndUpload(body: Record<string, unknown>) {
  const mediaKey = body.mediaKey;
  if (!validUploadKey(mediaKey)) throw new Error("mediaKey must point to an uploaded media file");
  const editorState = typeof body.editorState === "string" ? body.editorState : "";
  const document = getExportDocument(editorState);
  const bucket = requiredEnvironment("MEDIA_BUCKET");
  const mediaUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: mediaKey }), {
    expiresIn: 30 * 60
  });
  const completeDocument = {
    ...document,
    media: { ...document.media, src: mediaUrl }
  };
  const finalEditorState = JSON.stringify(completeDocument);
  const image = document.mediaType === "image";
  const extension = image ? "png" : "mp4";
  const exportKey = `exports/${randomUUID()}.${extension}`;
  const outputPath = path.join(RENDER_TEMPORARY_DIRECTORY, `${randomUUID()}.${extension}`);

  try {
    await renderExactCanvas({
      editorState: finalEditorState,
      destination: outputPath,
      frontendUrl: requiredEnvironment("FRONTEND_URL").replace(/\/$/, ""),
      temporaryDirectory: RENDER_TEMPORARY_DIRECTORY
    });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: exportKey,
      Body: createReadStream(outputPath),
      ContentType: image ? "image/png" : "video/mp4",
      ContentDisposition: `attachment; filename="content-canvas-export.${extension}"`
    }));
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: exportKey }), {
      expiresIn: SIGNED_DOWNLOAD_SECONDS
    });
    return { downloadUrl, format: image ? "image" : "video", expiresInSeconds: SIGNED_DOWNLOAD_SECONDS };
  } finally {
    await rm(outputPath, { force: true });
  }
}

/** A Lambda Function URL handler; no Koa server or API Gateway is required. */
export async function handler(event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> {
  if (event.requestContext.http.method === "OPTIONS") return response(204, {});
  if (event.requestContext.http.method !== "POST") return response(405, { error: "Only POST is supported" });

  try {
    const body = readJsonBody(event);
    if (event.rawPath.endsWith("/upload-url")) return response(200, await createUploadUrl(body));
    if (event.rawPath.endsWith("/render")) return response(200, await renderAndUpload(body));
    return response(404, { error: "Route not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    console.error(message, error);
    return response(400, { error: message });
  }
}
