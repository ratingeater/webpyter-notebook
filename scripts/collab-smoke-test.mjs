import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(provider, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);

    const handler = (...args) => {
      cleanup();
      resolve(args);
    };

    const cleanup = () => {
      clearTimeout(timer);
      provider.off(eventName, handler);
    };

    provider.on(eventName, handler);
  });
}

function requireText(doc, key) {
  const text = doc.getText(key);
  return text;
}

async function run() {
  const serverUrl = process.env.COLLAB_WS_URL || "ws://127.0.0.1:8787/ws";
  const token = process.env.COLLAB_TOKEN || "";
  const notebookId = process.env.NOTEBOOK_ID || `smoke-${Date.now()}`;

  const params = token ? { token } : {};

  const expectedTitle = `Smoke Test ${Date.now()}`;
  const expectedFirstCellLine = `print("hello-${Math.random().toString(16).slice(2)}")`;

  // Phase 1: connect + write
  {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(serverUrl, notebookId, doc, {
      connect: true,
      params,
      WebSocketPolyfill: WebSocket,
      disableBc: true,
    });

    await waitFor(provider, "sync", 15000);

    const title = requireText(doc, "title");
    doc.transact(() => {
      title.delete(0, title.length);
      title.insert(0, expectedTitle);
    });

    const cells = doc.getArray("cells");
    if (cells.length === 0) {
      throw new Error("No cells present after sync (expected default notebook)");
    }
    const first = cells.get(0);
    const firstContent = first.get("content");
    if (!(firstContent instanceof Y.Text)) {
      throw new Error("First cell content is not a Y.Text");
    }
    doc.transact(() => {
      firstContent.delete(0, firstContent.length);
      firstContent.insert(0, expectedFirstCellLine);
    });

    // Give the server time to persist via alarm.
    await sleep(2500);

    provider.destroy();
    doc.destroy();
  }

  // Phase 2: reconnect + verify persistence
  {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(serverUrl, notebookId, doc, {
      connect: true,
      params,
      WebSocketPolyfill: WebSocket,
      disableBc: true,
    });

    await waitFor(provider, "sync", 15000);

    const title = doc.getText("title").toString();
    const cells = doc.getArray("cells");
    const first = cells.get(0);
    const firstContent = first.get("content");
    const firstValue = firstContent instanceof Y.Text ? firstContent.toString() : "";

    provider.destroy();
    doc.destroy();

    if (title !== expectedTitle) {
      throw new Error(`Persisted title mismatch: expected=${expectedTitle} actual=${title}`);
    }
    if (firstValue !== expectedFirstCellLine) {
      throw new Error(
        `Persisted first cell mismatch: expected=${expectedFirstCellLine} actual=${firstValue}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        serverUrl,
        notebookId,
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

