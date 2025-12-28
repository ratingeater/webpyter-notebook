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

async function run() {
  const host = process.env.SMOKE_HOST || "127.0.0.1";
  const port = Number(process.env.SMOKE_PORT || "4175");
  const baseUrl = `http://${host}:${port}`;
  const notebookId = process.env.NOTEBOOK_ID || `smoke-ui-collab-${Date.now()}`;
  const notebookUrl = `${baseUrl}/n/${encodeURIComponent(notebookId)}`;

  const workerPort = Number(process.env.WORKER_PORT || "8787");
  const collabWsUrl = process.env.COLLAB_WS_URL || `ws://127.0.0.1:${workerPort}/ws`;

  const nowIso = new Date().toISOString();
  const seededTitle = `Seeded ${Date.now()}`;
  const seededMd = "# Seeded Notebook\n\nHello seed";

  const notebooksJson = JSON.stringify({
    [notebookId]: {
      metadata: {
        id: notebookId,
        title: seededTitle,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      cells: [
        {
          id: "cell-md",
          type: "markdown",
          content: seededMd,
          status: "idle",
        },
        {
          id: "cell-code",
          type: "code",
          content: 'print("seed")',
          status: "idle",
        },
      ],
      variables: [],
    },
  });

  const viteEnv = {
    ...process.env,
    VITE_DEFAULT_KERNEL_MODE: "pyodide",
    VITE_BACKEND_KERNEL_URL: "",
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
    await waitForHttpOk(`http://127.0.0.1:${workerPort}/api/health`, 30_000);
    await waitForHttpOk(baseUrl, 30_000);

    const launchOptions = resolveBrowserLaunchOptions();
    browser = await chromium.launch({ ...launchOptions, headless: true });
    const context = await browser.newContext();

    // Seed local storage (simulates an existing backend/local notebook being made collaborative).
    await context.addInitScript(
      ({ notebooksJson, notebookId }) => {
        localStorage.setItem("jupyter-ish-notebooks", notebooksJson);
        localStorage.setItem("jupyter-ish-current-notebook", notebookId);
      },
      { notebooksJson, notebookId }
    );

    const page1 = await context.newPage();
    await page1.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page1.getByText("Pyodide Ready", { exact: true }).waitFor({ timeout: 180_000 });
    await page1.getByText(seededTitle, { exact: false }).first().waitFor({ timeout: 30_000 });
    await page1.getByText("Collab 1", { exact: true }).waitFor({ timeout: 60_000 });
    await page1.getByText("Seeded Notebook", { exact: false }).first().waitFor({ timeout: 30_000 });

    const page2 = await context.newPage();
    await page2.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page2.getByText("Pyodide Ready", { exact: true }).waitFor({ timeout: 180_000 });
    await page2.getByText(seededTitle, { exact: false }).first().waitFor({ timeout: 30_000 });

    // Both tabs should see two peers.
    await page1.getByText("Collab 2", { exact: true }).waitFor({ timeout: 60_000 });
    await page2.getByText("Collab 2", { exact: true }).waitFor({ timeout: 60_000 });

    // Update title in page1 and ensure it propagates to page2.
    const newTitle = `${seededTitle} (updated)`;
    await page1.getByText(seededTitle, { exact: false }).first().click();
    const titleInput = page1.locator("header input[type='text']").first();
    await titleInput.waitFor({ timeout: 10_000 });
    await titleInput.fill(newTitle);
    await page1.keyboard.press("Enter");
    await page2.getByText(newTitle, { exact: false }).first().waitFor({ timeout: 30_000 });

    // Delete a cell in page1 and ensure it syncs to page2.
    const cells1 = page1.locator(".cell-container");
    const cells2 = page2.locator(".cell-container");
    const initialCount = await cells1.count();
    if (initialCount < 2) throw new Error(`Expected at least 2 cells, got ${initialCount}`);

    await cells1.nth(1).hover();
    await cells1.nth(1).getByTitle("More options").click({ timeout: 10_000 });
    await page1.getByText("Delete cell", { exact: true }).click({ timeout: 10_000 });

    const expectedCount = initialCount - 1;
    await page1.waitForFunction(
      (count) => document.querySelectorAll(".cell-container").length === count,
      expectedCount,
      { timeout: 30_000 }
    );
    await page2.waitForFunction(
      (count) => document.querySelectorAll(".cell-container").length === count,
      expectedCount,
      { timeout: 30_000 }
    );

    // Regression guard (seeded notebook): should NOT contain the default collab template text.
    const defaultTemplateCountSeeded = await page1
      .locator("text=Welcome! Share this URL to collaborate.")
      .count();
    if (defaultTemplateCountSeeded > 0) {
      throw new Error("Detected duplicated default collab template text (seed+default merge)");
    }

    // Navigate to a brand new notebook and ensure UI refreshes correctly (regression for stale state).
    const beforeUrl = page1.url();
    await page1.getByTitle("New notebook").click({ timeout: 10_000 });
    await page1.waitForURL((u) => u.toString() !== beforeUrl, { timeout: 30_000 });
    await page1.getByText("New Notebook", { exact: false }).first().waitFor({ timeout: 60_000 });
    await page1.getByText("Collab 1", { exact: true }).waitFor({ timeout: 60_000 });

    // New notebook default should appear exactly once.
    await sleep(1000);
    const defaultTemplateCountNew = await page1
      .locator("text=Welcome! Share this URL to collaborate.")
      .count();
    if (defaultTemplateCountNew !== 1) {
      throw new Error(
        `Unexpected default template count in new notebook: expected=1 actual=${defaultTemplateCountNew}`
      );
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          notebookUrl,
          collabWsUrl,
          workerPort,
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
    await killProcessTree(server);
    await killProcessTree(worker);
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
