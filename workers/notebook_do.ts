import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

type CellType = "code" | "markdown";

const STORAGE_KEY = "ydoc.snapshot.v1";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;

type WsAttachment = {
  controlledAwarenessIds: number[];
};

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function randomId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function initDefaultNotebook(doc: Y.Doc) {
  const title = doc.getText("title");
  const cells = doc.getArray<Y.Map<unknown>>("cells");

  if (title.length === 0) title.insert(0, "Untitled Notebook");
  if (cells.length > 0) return;

  const mdCell = new Y.Map<unknown>();
  mdCell.set("id", randomId());
  mdCell.set("type", "markdown" satisfies CellType);
  const mdText = new Y.Text("# New Notebook\n\nWelcome! Share this URL to collaborate.");
  mdCell.set("content", mdText);

  const codeCell = new Y.Map<unknown>();
  codeCell.set("id", randomId());
  codeCell.set("type", "code" satisfies CellType);
  const codeText = new Y.Text("# Write Python code here\n# Shift+Enter to run");
  codeCell.set("content", codeText);

  cells.push([mdCell, codeCell]);
}

function sanitizeNotebookCells(doc: Y.Doc): boolean {
  const cells = doc.getArray<Y.Map<unknown>>("cells");
  const usedIds = new Set<string>();
  let mutated = false;

  doc.transact(() => {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (!(cell instanceof Y.Map)) continue;

      const rawId = cell.get("id");
      let id =
        typeof rawId === "string"
          ? rawId
          : rawId == null
            ? ""
            : String(rawId);
      id = id.trim();

      if (!id || usedIds.has(id)) {
        let next = randomId();
        while (usedIds.has(next)) next = randomId();
        cell.set("id", next);
        id = next;
        mutated = true;
      } else if (rawId !== id) {
        cell.set("id", id);
        mutated = true;
      }

      usedIds.add(id);

      const rawType = cell.get("type");
      if (rawType !== "code" && rawType !== "markdown") {
        cell.set("type", "code" satisfies CellType);
        mutated = true;
      }

      const rawContent = cell.get("content");
      if (!(rawContent instanceof Y.Text)) {
        const nextContent = typeof rawContent === "string" ? rawContent : "";
        cell.set("content", new Y.Text(nextContent));
        mutated = true;
      }
    }
  });

  return mutated;
}

export class NotebookDO {
  private readonly state: DurableObjectState;
  private readonly doc: Y.Doc;
  private readonly awareness: awarenessProtocol.Awareness;
  private initializing = true;
  private persistPending = false;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (this.initializing) return;
      this.broadcastUpdate(update, origin);
      this.schedulePersist();
    });

    this.awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;

        const originWs = origin instanceof WebSocket ? origin : null;
        if (originWs) {
          const ids = this.getControlledAwarenessIds(originWs);
          added.forEach((id) => ids.add(id));
          updated.forEach((id) => ids.add(id));
          removed.forEach((id) => ids.delete(id));
          this.setControlledAwarenessIds(originWs, ids);
        }

        const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, update);
        this.broadcast(encoding.toUint8Array(encoder), originWs ?? undefined);
      }
    );

    state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<ArrayBuffer>(STORAGE_KEY);
      if (stored) {
        Y.applyUpdate(this.doc, new Uint8Array(stored));
      } else {
        initDefaultNotebook(this.doc);
        await this.persistSnapshot();
      }

      const sanitized = sanitizeNotebookCells(this.doc);
      if (sanitized) await this.persistSnapshot();

      this.initializing = false;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if ((request.headers.get("Upgrade") ?? "").toLowerCase() === "websocket") {
      return this.handleWebSocket();
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.endsWith("/snapshot")) {
      const update = Y.encodeStateAsUpdate(this.doc);
      return new Response(update, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }

    return new Response("expected websocket", { status: 426 });
  }

  async alarm(): Promise<void> {
    await this.persistSnapshot();
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    void this.onMessage(ws, message);
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.onClose(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.onClose(ws);
  }

  private handleWebSocket(): Response {
    // Best-effort: keep cell ids unique/stable even for docs created by older clients.
    // Doing this before accepting the socket ensures the new client receives the sanitized state in sync step 1.
    sanitizeNotebookCells(this.doc);

    const pair = new WebSocketPair();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [client, server] = Object.values(pair) as any as [WebSocket, WebSocket];

    this.state.acceptWebSocket(server);
    server.serializeAttachment({ controlledAwarenessIds: [] } satisfies WsAttachment);
    this.sendInitialSync(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private sendInitialSync(ws: WebSocket) {
    // Sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send(ws, encoding.toUint8Array(encoder));

    // Awareness states
    const states = Array.from(this.awareness.getStates().keys());
    if (states.length > 0) {
      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(this.awareness, states);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessUpdate);
      this.send(ws, encoding.toUint8Array(enc));
    }
  }

  private async onMessage(ws: WebSocket, data: unknown): Promise<void> {
    const message = this.asUint8Array(data);
    if (!message) return;

    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);

        const reply = encoding.toUint8Array(encoder);
        // 1 byte = message type only; anything longer means we have a reply payload.
        if (reply.length > 1) this.send(ws, reply);
        return;
      }
      case MESSAGE_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
        return;
      }
      case MESSAGE_AUTH: {
        // Not used (kept for protocol compatibility)
        return;
      }
      default: {
        return;
      }
    }
  }

  private onClose(ws: WebSocket) {
    const controlled = this.getControlledAwarenessIds(ws);
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      Array.from(controlled),
      null
    );
  }

  private broadcastUpdate(update: Uint8Array, origin: unknown) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    const originWs = origin instanceof WebSocket ? origin : undefined;
    this.broadcast(message, originWs);
  }

  private broadcast(message: Uint8Array, exclude?: WebSocket) {
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: Uint8Array) {
    try {
      ws.send(toArrayBuffer(message));
    } catch {
      // ignore
    }
  }

  private asUint8Array(data: unknown): Uint8Array | null {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof data === "string") {
      return new TextEncoder().encode(data);
    }
    return null;
  }

  private getControlledAwarenessIds(ws: WebSocket): Set<number> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    const ids = Array.isArray(attachment?.controlledAwarenessIds)
      ? attachment.controlledAwarenessIds
      : [];
    return new Set(ids.filter((n) => Number.isInteger(n) && n >= 0));
  }

  private setControlledAwarenessIds(ws: WebSocket, ids: Set<number>) {
    ws.serializeAttachment({ controlledAwarenessIds: Array.from(ids) } satisfies WsAttachment);
  }

  private schedulePersist() {
    if (this.persistPending) return;
    this.persistPending = true;
    void this.state.storage.setAlarm(Date.now() + 1000);
  }

  private async persistSnapshot() {
    this.persistPending = false;
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    await this.state.storage.put(STORAGE_KEY, toArrayBuffer(snapshot));
  }
}
