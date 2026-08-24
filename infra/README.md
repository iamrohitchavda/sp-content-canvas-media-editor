# AWS Lambda + S3 renderer

This folder deploys the existing exact-canvas exporter as a **synchronous Lambda container**.
It is intended for short videos (about 15 seconds) and static images.

## What is deployed

```
Browser ── request upload URL ──> Lambda Function URL
Browser ── upload original media ─> private S3 uploads/...
Browser ── editor state + S3 key ─> Lambda Function URL
Lambda  ── signed read URL ──────> private S3 uploads/...
Lambda  ── opens Vercel /export in Chrome, captures frames, FFmpeg encodes
Lambda  ── writes finished PNG/MP4 -> private S3 exports/...
Lambda  ── signed download URL ──> Browser
```

The browser never receives AWS credentials. The S3 bucket is private; temporary
URLs are made only by Lambda for one upload, one renderer read, or one download.

## Before deploying

1. Install the AWS CLI, AWS SAM CLI, Docker Desktop, and configure an AWS account/region locally.
2. Deploy the frontend to Vercel first. Lambda must be able to open its public `/export` route.
3. Decide the exact Vercel origin, for example `https://sp-content-canvas-media-editor.vercel.app`.

## Deploy

From the project root:

```bash
sam build
sam deploy --guided
```

When SAM asks for parameters:

- `FrontendUrl`: the full Vercel deployment URL, without a trailing slash.
- `AllowedOrigin`: the same URL's origin.

SAM builds the Linux Docker image, uploads it to Amazon ECR, creates the private
S3 bucket, Lambda, its Function URL, and least-privilege bucket access.

## Connect Vercel

In the Vercel project's production environment variables set:

```text
VITE_DEMO_MODE=false
VITE_RENDER_FUNCTION_URL=<RenderFunctionUrl SAM output>
```

Redeploy the frontend after saving those variables. Do **not** put AWS access keys
in Vercel; the browser only needs the Function URL.

## Operational limits and safety

- This is synchronous: the browser waits for rendering to finish. Keep videos short.
- Lambda is configured with 6 GB memory, 10 GB temporary `/tmp` space, and a 15-minute limit.
- Function URL responses return a signed S3 download URL, not the MP4 itself.
  That avoids Lambda's small direct-response payload limit.
- `AuthType: NONE` is suitable only for a controlled demo. It prevents no one from
  spending your render budget. Before a public launch, use authentication plus per-user
  quotas/rate-limits, and add S3 lifecycle rules after deciding your retention policy.
- The local Koa service is unchanged and remains useful for local development.
