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
  const port = Number(process.env.SMOKE_PORT || "4174");
  const baseUrl = `http://${host}:${port}`;
  const notebookId = process.env.NOTEBOOK_ID || `smoke-ui-bad-backend-${Date.now()}`;
  const notebookUrl = `${baseUrl}/n/${encodeURIComponent(notebookId)}`;

  const badBackendUrl = process.env.BAD_BACKEND_URL || "http://127.0.0.1:8787";

  const viteEnv = {
    ...process.env,
    VITE_DEFAULT_KERNEL_MODE: "backend",
    VITE_BACKEND_KERNEL_URL: badBackendUrl,
    VITE_COLLAB_WS_URL: "",
  };

  {
    const build = spawnNpm(["run", "-s", "build"], { stdio: "inherit", env: viteEnv });
    const code = await new Promise((resolve) => build.on("exit", resolve));
    if (code !== 0) throw new Error(`build failed (${code})`);
  }

  const server = spawnNpm(
    ["run", "-s", "preview", "--", "--host", host, "--port", String(port), "--strictPort"],
    { stdio: "inherit", env: viteEnv }
  );

  let browser;
  try {
    await waitForHttpOk(baseUrl, 30_000);

    const launchOptions = resolveBrowserLaunchOptions();
    browser = await chromium.launch({ ...launchOptions, headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(notebookUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Notebook UI should still render.
    await page.getByText("New Notebook").first().waitFor({ timeout: 30_000 });

    // We should show an error banner about the backend being invalid.
    await page.getByText("Backend URL points to the collaboration Worker", { exact: false }).waitFor({
      timeout: 30_000,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          notebookUrl,
          badBackendUrl,
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
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

