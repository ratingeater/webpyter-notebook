# Jupyter-ish Notebook

A modern, web-based Jupyter-like notebook with **Pyodide** execution (in-browser) and optional **real-time collaboration** via **Cloudflare Workers + Durable Objects** (Yjs).

## Features

- **Pyodide execution**: Browser-based Python (no server-side code execution)
- **Optional backend kernel**: Connect to the legacy `backend/` server (or your own) for full Python with `pip`
- **Optional real-time collaboration**: Yjs over WebSockets (1 notebook URL = 1 Durable Object)
- **Durable persistence (collab mode)**: Notebook state stored in DO transactional storage
- **Jupyter Magic Commands**: Support for `%%bash`, `%%python`, `%pip`, `%run`, etc.
- **Real-time Variable Inspector**: View all defined variables
- **Auto-save**: Automatic notebook saving
- **Notebook management**: List/delete saved notebooks (localStorage or backend `/notebooks`)
- **Dark Theme**: Beautiful dark theme optimized for coding
- **Monaco Editor**: VS Code-like editing experience

## Quick Start

### Local development (legacy backend + frontend)

```bash
# Starts Python backend + Vite frontend (no Workers required)
./deploy.sh
```

### Local development (with Durable Objects collaboration)

```bash
# Starts Python backend + DO worker + Vite frontend
ENABLE_COLLAB=1 ./deploy.sh
```

Open `http://localhost:5173` and share the `/n/<notebookId>` URL.

Smoke-test the collab backend (local):

```bash
npm run worker:dev -- --local --port 8787
COLLAB_WS_URL=ws://127.0.0.1:8787/ws npm run collab:smoke
```

Smoke-test the frontend (Pyodide output, headless browser):

```bash
npm run ui:smoke
```

By default it uses `msedge` on Windows; override with `PLAYWRIGHT_CHANNEL` or `PLAYWRIGHT_EXECUTABLE_PATH`.

### Deploy to Cloudflare

#### 1) Deploy the Worker + Durable Object

```bash
# One-time auth
wrangler login

# Deploy
npm run worker:deploy
```

Optional auth (recommended):

```bash
wrangler secret put COLLAB_AUTH_TOKEN
```

#### 2) Deploy the frontend to Cloudflare Pages

**Option A (Dashboard)**

Cloudflare Pages settings:
- Build command: `npm run build`
- Output directory: `dist`
- Env var (optional): `VITE_COLLAB_WS_URL=wss://<your-worker-domain>/ws`
- Env var (optional): `VITE_DEFAULT_KERNEL_MODE=pyodide`

**Option B (Wrangler CLI / quick test)**

```bash
# One-time
wrangler pages project create webpyter-notebook --production-branch main

# Build with desired runtime defaults (recommended for Pages)
VITE_BACKEND_KERNEL_URL= VITE_COLLAB_WS_URL=wss://<your-worker-domain>/ws npm run build

# Deploy
wrangler pages deploy dist --project-name webpyter-notebook --branch main
```

The app is a SPA; `public/_redirects` is included for `/n/<id>` routes.

## Environment Variables

These are **defaults** for first load / deployments. You can override them at runtime in the app via **Settings** (stored in `localStorage`).

Frontend (`Vite` / Pages):
- `VITE_BACKEND_KERNEL_URL` (optional): default backend kernel base URL
- `VITE_DEFAULT_KERNEL_MODE` (optional): `backend` or `pyodide` (defaults to `backend` when a backend URL is configured, else `pyodide`)
- `VITE_COLLAB_WS_URL` (optional): enables collaboration; should be the Worker base URL ending in `/ws` (the client connects to `${VITE_COLLAB_WS_URL}/${notebookId}`)
- `VITE_COLLAB_TOKEN` (optional): sent to the Worker as `?token=...`
- `VITE_COLLAB_CONNECT_TIMEOUT_MS` (optional): fallback to local-only mode when the collab server is unreachable

Worker (`wrangler`):
- `COLLAB_AUTH_TOKEN` (optional): when set, `/ws/:id` requires `?token=<COLLAB_AUTH_TOKEN>`

## Architecture

```
Frontend (Cloudflare Pages / Vite)
  - Pyodide runs in the browser
  - Optional collab WebSocket: ${VITE_COLLAB_WS_URL}/{notebookId}

Backend (Cloudflare Worker + Durable Objects)
  - Worker routes /ws/:notebookId -> NotebookDO instance
  - NotebookDO implements y-websocket protocol (sync + awareness)
  - Persists Yjs snapshot to Durable Object storage
```

## Notes

- Durable Objects are used only for CRDT sync/persistence, not for executing Python code.
- Durable Object storage has a 2MB value limit per key; this implementation stores a single Yjs snapshot and is best suited for small-to-medium notebooks.
- The legacy `backend/` Python kernel server is not deployable on Cloudflare Workers; run it elsewhere if you need full Python with `pip`.
- `VITE_COLLAB_TOKEN` is suitable for local testing; for real auth, use a user/session-based approach (a shared token embedded in a public frontend is not secret).

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift + Enter` | Run cell and advance |
| `Ctrl + Enter` | Run cell without advancing |
| `Ctrl + S` | Save notebook |
| `Escape` | Exit edit mode |

## License

MIT License
