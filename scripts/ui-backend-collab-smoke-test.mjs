import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { chromium } from "playwright-core";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url, timeoutMs) {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timeout waiting for ${url}`);
    }
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(250);
  }
}

function spawnNpm(args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return spawn("npm", args, options);
}

async function killProcessTree(proc) {
  if (!proc || typeof proc.pid !== "number") return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  proc.kill("SIGTERM");
}

function resolveBrowserLaunchOptions() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();
  if (executablePath && existsSync(executablePath)) {
    return { executablePath };
  }

  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  if (channel) return { channel };

  if (process.platform === "win32") return { channel: "msedge" };
  return { channel: "chrome" };
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : null;
}

async function run() {
  const host = process.env.SMOKE_HOST || "127.0.0.1";
  const port = Number(process.env.SMOKE_PORT || "4176");
  const baseUrl = `http://${host}:${port}`;
  const notebookId = process.env.NOTEBOOK_ID || `smoke-ui-backend-collab-${Date.now()}`;
  const notebookUrl = `${baseUrl}/n/${encodeURIComponent(notebookId)}`;

  const workerPort = Number(process.env.WORKER_PORT || "8787");
  const collabWsUrl = process.env.COLLAB_WS_URL || `ws://127.0.0.1:${workerPort}/ws`;

  const backendPort = Number(process.env.BACKEND_PORT || "5005");
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

  // Minimal backend kernel + storage server (in-memory).
  const nowIso = new Date().toISOString();
  const notebooks = new Map();
  notebooks.set(notebookId, {
    id: notebookId,
    title: "Backend Notebook",
    created: nowIso,
    modified: nowIso,
    // Intentionally duplicate ids to ensure the frontend sanitizes/handles it.
    cells: [
      { id: "dup", type: "markdown", content: "# From Backend\n\nHello", status: "idle" },
      { id: "dup", type: "code", content: 'print(\"backend\")', status: "idle" },
    ],
  });

  const backendServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", backendBaseUrl);
      if (req.method === "OPTIONS") return json(res, 204, {});

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, name: "Mock Backend", features: { notebook_storage: true } });
      }

      if (req.method === "POST" && url.pathname === "/execute") {
        const body = await readJson(req);
        const code = String(body?.code ?? "");
        return json(res, 200, { output: { type: "text", content: `ok: ${code.slice(0, 20)}` } });
      }

      if (req.method === "GET" && url.pathname === "/variables") {
        return json(res, 200, { variables: [] });
      }

      if (req.method === "POST" && (url.pathname === "/restart" || url.pathname === "/interrupt")) {
        return json(res, 200, { ok: true });
      }

      if (req.method === "GET" && url.pathname === "/notebooks") {
        const list = Array.from(notebooks.values()).map((nb) => ({
          id: nb.id,
          title: nb.title,
          created: nb.created,
          modified: nb.modified,
        }));
        return json(res, 200, { notebooks: list });
      }

      const match = url.pathname.match(/^\/notebooks\/(.+)$/);
      if (match) {
        const id = decodeURIComponent(match[1] || "");
        if (req.method === "GET") {
          const nb = notebooks.get(id);
          if (!nb) return json(res, 404, { error: "Notebook not found" });
          return json(res, 200, { notebook: nb });
        }
        if (req.method === "PUT" || req.method === "POST") {
          const body = await readJson(req);
          const next = {
            id,
            title: String(body?.title ?? "Untitled Notebook"),
            created: notebooks.get(id)?.created ?? nowIso,
            modified: new Date().toISOString(),
            cells: Array.isArray(body?.cells) ? body.cells : [],
          };
          notebooks.set(id, next);
          return json(res, 200, { ok: true, id });
        }
        if (req.method === "DELETE") {
          notebooks.delete(id);
          return json(res, 200, { ok: true });
        }
      }

      return json(res, 404, { error: "not found" });
    } catch (e) {
      return json(res, 500, { error: String(e) });
    }
  });

  await new Promise((resolve) => backendServer.listen(backendPort, "127.0.0.1", resolve));

  const viteEnv = {
    ...process.env,
    VITE_DEFAULT_KERNEL_MODE: "backend",
    VITE_BACKEND_KERNEL_URL: backendBaseUrl,
    VITE_COLLAB_WS_URL: collabWsUrl,
  };

  // Start local collab worker.
  const worker = spawnNpm(
    ["run", "-s", "worker:dev", "--", "--local", "--port", String(workerPort), "--show-interactive-dev-session", "false"],
    { stdio: "inherit", env: process.env }
  );

  // Build first (ensures preview is deterministic).
  {
    const build = spawnNpm(["run", "-s", "build"], { stdio: "inherit", env: viteEnv });
    const code = await new Promise((resolve) => build.on("exit", resolve));
    if (code !== 0) throw new Error(`build failed (${code})`);
  }

  // Start preview server.
  const server = spawnNpm(
    ["run", "-s", "preview", "--", "--host", host, "--port", String(port), "--strictPort"],
    { stdio: "inherit", env: viteEnv }
  );

  let browser;
  try {
    await waitForHttpOk(`${backendBaseUrl}/health`, 30_000);
    await waitForHttpOk(`http://127.0.0.1:${workerPort}/api/health`, 30_000);
    await waitForHttpOk(baseUrl, 30_000);

    const launchOptions = resolveBrowserLaunchOptions();
    browser = await chromium.launch({ ...launchOptions, headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Expect backend to connect.
    await page.getByText("Backend Ready", { exact: true }).waitFor({ timeout: 60_000 });

    // Expect collab to connect with a single peer.
    await page.getByText("Collab 1", { exact: true }).waitFor({ timeout: 60_000 });

    // Ensure we rendered cells and can delete one (regression for duplicate ids from backend).
    const cells = page.locator(".cell-container");
    await page.getByText("From Backend", { exact: false }).first().waitFor({ timeout: 30_000 });
    const initialCount = await cells.count();
    if (initialCount < 2) throw new Error(`expected at least 2 cells, got ${initialCount}`);

    await cells.nth(1).hover();
    await cells.nth(1).getByTitle("More options").click({ timeout: 10_000 });
    await page.getByText("Delete cell", { exact: true }).click({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const afterCount = await cells.count();
    if (afterCount >= initialCount) {
      throw new Error(`cell delete did not reduce count: ${initialCount} -> ${afterCount}`);
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          notebookUrl,
          backendBaseUrl,
          collabWsUrl,
          initialCount,
          afterCount,
          ...launchOptions,
        },
        null,
        2
      )
    );
  } finally {
    try {
      await browser?.close();
    } catch {
      // ignore
    }
    backendServer.close();
    await killProcessTree(server);
    await killProcessTree(worker);
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
