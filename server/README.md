# Koa render API

Start the service with `npm run server`.

- `GET /api/health` confirms the API is available.
- `POST /api/renders` accepts `{ "variables": { ... } }` and queues a Revideo render.
- `GET /api/renders/:id` returns `queued`, `rendering`, `complete`, or `failed`.
- `GET /api/renders/:id/download` downloads the completed MP4.

Exports are written to `exports/`. The queue is in-memory for local development; production should replace it with durable storage and a worker queue.

## AWS short-video option

The local API remains useful for development. For a synchronous Lambda + private
S3 deployment of short videos, see [`infra/README.md`](../infra/README.md).
That deployment uses the same `/export` React page and the shared renderer in
`server/rendering/renderExactCanvas.ts`.
