import { useState, useCallback, useEffect, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness } from "y-protocols/awareness";

import type { KernelClient } from "@/lib/kernel-client";
import { selectKernelClient, reconnectKernel } from "@/lib/kernel-manager";
import { COLLAB_CONFIG_CHANGED_EVENT, getCollabConfig, type CollabConfig } from "@/lib/collab";
import { getNotebookAsync, saveNotebook, saveNotebookAsync, setCurrentNotebookId } from "@/lib/notebook-storage";
import type { Cell, CellOutput, CellType, NotebookState } from "@/types/notebook";

type RuntimeCellState = {
  status: Cell["status"];
  output?: CellOutput;
  executionCount?: number;
  isCollapsed?: boolean;
};

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11);

function asCellType(value: unknown): CellType {
  return value === "markdown" ? "markdown" : "code";
}

function applyTextDiff(yText: Y.Text, nextValue: string) {
  const prevValue = yText.toString();
  if (prevValue === nextValue) return;

  let start = 0;
  while (
    start < prevValue.length &&
    start < nextValue.length &&
    prevValue[start] === nextValue[start]
  ) {
    start += 1;
  }

  let endPrev = prevValue.length;
  let endNext = nextValue.length;
  while (
    endPrev > start &&
    endNext > start &&
    prevValue[endPrev - 1] === nextValue[endNext - 1]
  ) {
    endPrev -= 1;
    endNext -= 1;
  }

  yText.delete(start, endPrev - start);
  const insertText = nextValue.slice(start, endNext);
  if (insertText) yText.insert(start, insertText);
}

function ensureNotebookInitialized(doc: Y.Doc) {
  const title = doc.getText("title");
  const cells = doc.getArray<Y.Map<unknown>>("cells");

  if (title.length === 0) title.insert(0, "Untitled Notebook");
  if (cells.length > 0) return;

  const mdCell = new Y.Map<unknown>();
  mdCell.set("id", generateId());
  mdCell.set("type", "markdown");
  mdCell.set("content", new Y.Text("# New Notebook\n\nWelcome! Share this URL to collaborate."));

  const codeCell = new Y.Map<unknown>();
  codeCell.set("id", generateId());
  codeCell.set("type", "code");
  codeCell.set("content", new Y.Text("# Write Python code here\n# Shift+Enter to run"));

  cells.push([mdCell, codeCell]);
}

const DEFAULT_NOTEBOOK_TITLE = "Untitled Notebook";
const DEFAULT_NOTEBOOK_MD = "# New Notebook\n\nWelcome! Share this URL to collaborate.";
const DEFAULT_NOTEBOOK_CODE = "# Write Python code here\n# Shift+Enter to run";

const COLLAB_HEARTBEAT_MS = 15_000;
const COLLAB_STALE_MS = 60_000;

function getActiveAwarenessClientIds(awareness: Awareness | null, localClientId: number): number[] {
  if (!awareness) return [];

  const states = awareness.getStates();
  const meta = (awareness as unknown as { meta?: Map<number, { lastUpdated?: number }> }).meta;
  const now = Date.now();

  const ids: number[] = [];
  for (const id of states.keys()) {
    if (id === localClientId) {
      ids.push(id);
      continue;
    }

    const lastUpdated = meta?.get?.(id)?.lastUpdated;
    if (typeof lastUpdated === "number" && now - lastUpdated > COLLAB_STALE_MS) continue;

    ids.push(id);
  }

  return ids;
}

function getAwarenessPeerCount(awareness: Awareness | null, localClientId: number): number {
  if (!awareness) return 1;
  const active = getActiveAwarenessClientIds(awareness, localClientId);
  return Math.max(1, active.length || awareness.getStates().size || 1);
}

function looksLikeDefaultNotebookDoc(doc: Y.Doc): boolean {
  const title = doc.getText("title").toString();
  if (title !== DEFAULT_NOTEBOOK_TITLE) return false;

  const cells = doc.getArray<Y.Map<unknown>>("cells");
  if (cells.length !== 2) return false;

  const cell0 = cells.get(0);
  const cell1 = cells.get(1);
  if (!cell0 || !cell1) return false;

  const type0 = String(cell0.get("type") ?? "");
  const type1 = String(cell1.get("type") ?? "");
  if (type0 !== "markdown" || type1 !== "code") return false;

  const text0 = cell0.get("content");
  const text1 = cell1.get("content");
  if (!(text0 instanceof Y.Text) || !(text1 instanceof Y.Text)) return false;

  const md = text0.toString().trim();
  const code = text1.toString().trim();

  const mdLooksDefault = md === DEFAULT_NOTEBOOK_MD || md.startsWith("# New Notebook");
  const codeLooksDefault = code === DEFAULT_NOTEBOOK_CODE || code.startsWith("# Write Python code here");

  return mdLooksDefault && codeLooksDefault;
}

function wsToHttpUrl(value: string): string {
  if (value.startsWith("wss://")) return `https://${value.slice("wss://".length)}`;
  if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
  return value;
}

function buildCollabHttpEndpoint(collab: CollabConfig, notebookId: string, suffix: string): string {
  const base = wsToHttpUrl(collab.serverUrl).replace(/\/+$/, "");
  const url = new URL(`${base}/${encodeURIComponent(notebookId)}/${suffix}`);

  const params = collab.params ?? {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === "string" && val) url.searchParams.set(key, val);
  }

  return url.toString();
}

async function tryFetchArrayBuffer(url: string, timeoutMs: number): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(0, Math.floor(timeoutMs)));
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function tryApplyRemoteCollabSnapshot(
  doc: Y.Doc,
  collab: CollabConfig,
  notebookId: string,
  shouldAbort: () => boolean
): Promise<boolean> {
  const url = buildCollabHttpEndpoint(collab, notebookId, "snapshot");
  const buf = await tryFetchArrayBuffer(url, collab.connectTimeoutMs);
  if (!buf || shouldAbort()) return false;

  try {
    if (buf.byteLength > 0) {
      Y.applyUpdate(doc, new Uint8Array(buf));
    }
    return true;
  } catch (e) {
    console.warn("Failed to apply collab snapshot:", e);
    return false;
  }
}

async function loadNotebookSnapshotIntoDoc(
  doc: Y.Doc,
  notebookId: string,
  shouldAbort?: () => boolean
): Promise<boolean> {
  const saved = await getNotebookAsync(notebookId);
  if (shouldAbort?.()) return false;
  if (!saved) {
    ensureNotebookInitialized(doc);
    return false;
  }

  doc.transact(() => {
    const yTitle = doc.getText("title");
    yTitle.delete(0, yTitle.length);
    yTitle.insert(0, saved.metadata.title || "Untitled Notebook");

    const yCells = doc.getArray<Y.Map<unknown>>("cells");
    if (yCells.length > 0) yCells.delete(0, yCells.length);

    const usedIds = new Set<string>();
    const nextCells = saved.cells.map((cell) => {
      let id = cell.id || generateId();
      if (usedIds.has(id)) id = generateId();
      usedIds.add(id);
      const yCell = new Y.Map<unknown>();
      yCell.set("id", id);
      yCell.set("type", cell.type);
      yCell.set("content", new Y.Text(cell.content || ""));
      return yCell;
    });

    if (nextCells.length > 0) {
      yCells.push(nextCells);
    }
  });

  ensureNotebookInitialized(doc);
  return true;
}

export function useNotebook(notebookId: string) {
  const [state, setState] = useState<NotebookState>(() => ({
    cells: [],
    activeCellId: null,
    kernelStatus: "disconnected",
    variables: [],
    lastSaved: null,
    isDirty: false,
    executionCounter: 0,
    notebookId,
    notebookTitle: "Untitled Notebook",
  }));

  const [kernelLoadingMessage, setKernelLoadingMessage] = useState<string>("");
  const [kernelKind, setKernelKind] = useState<"backend" | "pyodide" | null>(null);
  const kernelClientRef = useRef<KernelClient | null>(null);

  const [collabAwareness, setCollabAwareness] = useState<Awareness | null>(null);
  const [collabStatus, setCollabStatus] = useState<"disabled" | "connecting" | "connected" | "fallback">(
    "disabled"
  );
  const [collabPeerCount, setCollabPeerCount] = useState<number>(1);

  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const runtimeCellStateRef = useRef<Map<string, RuntimeCellState>>(new Map());

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const yCellByIdRef = useRef<Map<string, Y.Map<unknown>>>(new Map());
  const [collabConfigVersion, setCollabConfigVersion] = useState(0);

  // Keep a ref to current state for callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncScheduledRef = useRef<number | null>(null);
  const syncFromDoc = useCallback(() => {
    const doc = ydocRef.current;
    if (!doc) return;

    const yTitle = doc.getText("title");
    const yCells = doc.getArray<Y.Map<unknown>>("cells");

    const nextYCellById = new Map<string, Y.Map<unknown>>();
    const seenIds = new Set<string>();

    const nextCells: Cell[] = yCells.toArray().map((yCell) => {
      const id = String(yCell.get("id") ?? "");
      const type = asCellType(yCell.get("type"));
      const yText = yCell.get("content") as Y.Text | undefined;
      const content = yText ? yText.toString() : "";

      nextYCellById.set(id, yCell);
      seenIds.add(id);

      if (!runtimeCellStateRef.current.has(id)) {
        runtimeCellStateRef.current.set(id, { status: "idle" });
      }

      const runtime = runtimeCellStateRef.current.get(id)!;
      return {
        id,
        type,
        content,
        status: runtime.status,
        output: runtime.output,
        executionCount: runtime.executionCount,
        isCollapsed: runtime.isCollapsed,
      };
    });

    for (const id of Array.from(runtimeCellStateRef.current.keys())) {
      if (!seenIds.has(id)) runtimeCellStateRef.current.delete(id);
    }

    yCellByIdRef.current = nextYCellById;

    const title = yTitle.toString() || "Untitled Notebook";
    setState((prev) => ({
      ...prev,
      notebookId,
      notebookTitle: title,
      cells: nextCells,
      activeCellId:
        prev.activeCellId && nextYCellById.has(prev.activeCellId)
          ? prev.activeCellId
          : nextCells[0]?.id ?? null,
    }));
  }, [notebookId]);

  const scheduleSyncFromDoc = useCallback(() => {
    if (syncScheduledRef.current != null) return;
    syncScheduledRef.current = window.requestAnimationFrame(() => {
      syncScheduledRef.current = null;
      syncFromDoc();
    });
  }, [syncFromDoc]);

  const getCellYText = useCallback((cellId: string): Y.Text | null => {
    const yCell = yCellByIdRef.current.get(cellId);
    const yText = yCell?.get("content");
    return yText instanceof Y.Text ? yText : null;
  }, []);

  const setActiveCell = useCallback((cellId: string | null) => {
    setState((prev) => ({ ...prev, activeCellId: cellId }));
  }, []);

  useEffect(() => {
    const handler = () => setCollabConfigVersion((prev) => prev + 1);
    window.addEventListener(COLLAB_CONFIG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(COLLAB_CONFIG_CHANGED_EVENT, handler);
  }, []);

  // Collaboration: connect per-notebookId
  useEffect(() => {
    const collab = getCollabConfig();
    setCollabStatus(collab ? "connecting" : "disabled");
    setCollabPeerCount(1);
    setCurrentNotebookId(notebookId);
    runtimeCellStateRef.current = new Map();
    yCellByIdRef.current = new Map();

    providerRef.current?.destroy();
    providerRef.current = null;
    ydocRef.current?.destroy();
    ydocRef.current = null;
    awarenessRef.current = null;
    setCollabAwareness(null);

    setState((prev) => ({
      ...prev,
      notebookId,
      notebookTitle: "Untitled Notebook",
      cells: [],
      activeCellId: null,
      variables: [],
      lastSaved: null,
      isDirty: false,
      executionCounter: 0,
    }));

    const doc = new Y.Doc();
    ydocRef.current = doc;
    let disposed = false;
    let detachAwarenessListener: (() => void) | null = null;
    let detachProviderListeners: (() => void) | null = null;

    let readyToMarkDirty = false;
    const onDocUpdate = () => {
      if (readyToMarkDirty) {
        setState((prev) => (prev.isDirty ? prev : { ...prev, isDirty: true }));
      }
      scheduleSyncFromDoc();
    };

    doc.on("update", onDocUpdate);

    if (!collab) {
      const localAwareness = new Awareness(doc);
      try {
        localAwareness.setLocalStateField("user", { name: "You" });
      } catch {
        // ignore
      }
      const syncPeers = () => setCollabPeerCount(getAwarenessPeerCount(localAwareness, doc.clientID));
      localAwareness.on("update", syncPeers);
      syncPeers();
      detachAwarenessListener = () => localAwareness.off("update", syncPeers);

      awarenessRef.current = localAwareness;
      setCollabAwareness(localAwareness);

      void loadNotebookSnapshotIntoDoc(doc, notebookId, () => disposed).then(() => {
        if (disposed) return;
        scheduleSyncFromDoc();
        readyToMarkDirty = true;
      });

      return () => {
        disposed = true;
        detachAwarenessListener?.();
        doc.off("update", onDocUpdate);
        doc.destroy();
      };
    }

    const provider = new WebsocketProvider(collab.serverUrl, notebookId, doc, {
      connect: false,
      params: collab.params ?? {},
    });
    providerRef.current = provider;

    try {
      provider.awareness.setLocalStateField("user", { name: "You" });
    } catch {
      // ignore
    }

    // Heartbeat helps avoid ghost peers when clients disconnect uncleanly (and powers leader election).
    let heartbeatId: number | null = null;
    try {
      provider.awareness.setLocalStateField("hb", Date.now());
      heartbeatId = window.setInterval(() => {
        try {
          provider.awareness.setLocalStateField("hb", Date.now());
        } catch {
          // ignore
        }
      }, COLLAB_HEARTBEAT_MS);
    } catch {
      // ignore
    }

    const syncPeers = () => setCollabPeerCount(getAwarenessPeerCount(provider.awareness, doc.clientID));
    provider.awareness.on("update", syncPeers);
    syncPeers();
    detachAwarenessListener = () => {
      provider.awareness.off("update", syncPeers);
      if (heartbeatId != null) window.clearInterval(heartbeatId);
    };

    awarenessRef.current = provider.awareness;
    setCollabAwareness(provider.awareness);

    let synced = false;
    let seededFromStorage = false;
    let syncTimeoutId: number | null = null;

    const onSync = (isSynced: boolean) => {
      if (!isSynced) return;
      synced = true;
      setCollabStatus("connected");

      // If this DO is still the default notebook, and we have a saved notebook in storage,
      // seed the collaborative doc once (so backend/local notebooks can become collaborative).
      if (!seededFromStorage && looksLikeDefaultNotebookDoc(doc)) {
        void (async () => {
          const seeded = await loadNotebookSnapshotIntoDoc(doc, notebookId, () => disposed);
          if (disposed) return;
          seededFromStorage = seeded;
          scheduleSyncFromDoc();
        })();
      }

      if (syncTimeoutId != null) {
        window.clearTimeout(syncTimeoutId);
        syncTimeoutId = null;
      }
    };

    provider.on("sync", onSync);
    detachProviderListeners = () => {
      provider.off("sync", onSync);
    };

    syncTimeoutId = window.setTimeout(() => {
      if (synced) return;
      // Don't tear anything down; just expose that we're running without confirmed realtime sync yet.
      setCollabStatus("fallback");
    }, collab.connectTimeoutMs);

    void (async () => {
      // Best-effort: load a snapshot over HTTP first. This avoids "some notebooks never sync" when the WS handshake is slow,
      // and ensures the initial doc matches the Durable Object before enabling edits.
      const appliedRemote = await tryApplyRemoteCollabSnapshot(doc, collab, notebookId, () => disposed);
      if (disposed) return;

      if (!appliedRemote) {
        // Collab is unreachable right now; fall back to local/backend snapshot (but keep trying websockets).
        setCollabStatus("fallback");
        seededFromStorage = await loadNotebookSnapshotIntoDoc(doc, notebookId, () => disposed);
        if (disposed) return;
      } else if (looksLikeDefaultNotebookDoc(doc)) {
        // Remote exists but is still the default notebook; seed it from storage if we have it.
        seededFromStorage = await loadNotebookSnapshotIntoDoc(doc, notebookId, () => disposed);
        if (disposed) return;
      }

      ensureNotebookInitialized(doc);
      scheduleSyncFromDoc();
      readyToMarkDirty = true;

      // Now connect websockets (realtime).
      provider.connect();
    })();

    return () => {
      disposed = true;
      if (syncTimeoutId != null) window.clearTimeout(syncTimeoutId);
      doc.off("update", onDocUpdate);
      detachAwarenessListener?.();
      detachProviderListeners?.();
      provider.destroy();
      doc.destroy();
    };
  }, [notebookId, collabConfigVersion, scheduleSyncFromDoc]);

  // Initialize kernel on mount
  useEffect(() => {
    const initKernel = async () => {
      const startLoading = () => {
        setState((prev) => ({ ...prev, kernelStatus: "loading" }));

        selectKernelClient((message) => setKernelLoadingMessage(message))
          .then((client) => {
            kernelClientRef.current = client;
            setKernelKind(client.kind);
            setState((prev) => ({ ...prev, kernelStatus: "idle" }));
            setKernelLoadingMessage("");
          })
          .catch((error) => {
            console.error("Failed to initialize kernel:", error);
            kernelClientRef.current = null;
            setKernelKind(null);
            setState((prev) => ({ ...prev, kernelStatus: "disconnected" }));
            const errorMsg =
              error instanceof Error ? error.message : "Failed to connect to kernel";
            setKernelLoadingMessage(errorMsg);
          });
      };

      if ("requestIdleCallback" in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
          startLoading
        );
      } else {
        setTimeout(startLoading, 100);
      }
    };

    initKernel();
  }, []);

  // Auto-save local snapshot every 30 seconds (client-side backup)
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (!stateRef.current.isDirty) return;

      const doc = ydocRef.current;
      if (!doc) return;

      const yTitle = doc.getText("title");
      const yCells = doc.getArray<Y.Map<unknown>>("cells");

      const snapshotCells: Cell[] = yCells.toArray().map((yCell) => {
        const id = String(yCell.get("id") ?? generateId());
        const type = asCellType(yCell.get("type"));
        const yText = yCell.get("content") as Y.Text | undefined;
        const content = yText ? yText.toString() : "";
        return { id, type, content, status: "idle" };
      });

      const title = yTitle.toString() || "Untitled Notebook";

      // Always keep a local backup on every client.
      saveNotebook(notebookId, title, snapshotCells, []);

      // Collaboration push principle: avoid having every peer hammer the backend.
      // Only the "leader" (lowest awareness client id) performs backend persistence.
      const awareness = awarenessRef.current;
      const ids = getActiveAwarenessClientIds(awareness, doc.clientID);
      const leaderId = ids.length > 0 ? Math.min(...ids) : doc.clientID;
      const isLeader = leaderId === doc.clientID;

      if (isLeader) {
        void saveNotebookAsync(notebookId, title, snapshotCells, []);
      }

      setState((prev) => ({
        ...prev,
        lastSaved: new Date(),
        isDirty: false,
      }));
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [notebookId]);

  const updateCellContent = useCallback((cellId: string, content: string) => {
    const yText = getCellYText(cellId);
    if (yText) applyTextDiff(yText, content);

    setState((prev) => ({
      ...prev,
      isDirty: true,
      cells: prev.cells.map((cell) => (cell.id === cellId ? { ...cell, content } : cell)),
    }));
  }, [getCellYText]);

  const addCell = useCallback((afterCellId: string | null, type: CellType = "code") => {
    const doc = ydocRef.current;
    if (!doc) return "";

    const yCells = doc.getArray<Y.Map<unknown>>("cells");

    const newCellId = generateId();
    const yCell = new Y.Map<unknown>();
    yCell.set("id", newCellId);
    yCell.set("type", type);
    yCell.set("content", new Y.Text(""));

    const index = afterCellId
      ? yCells.toArray().findIndex((c) => c.get("id") === afterCellId) + 1
      : yCells.length;

    yCells.insert(Math.max(0, index), [yCell]);

    runtimeCellStateRef.current.set(newCellId, { status: "idle" });
    setActiveCell(newCellId);
    setState((prev) => ({ ...prev, isDirty: true }));

    return newCellId;
  }, [setActiveCell]);

  const deleteCell = useCallback((cellId: string) => {
    const doc = ydocRef.current;
    if (!doc) return;

    const yCells = doc.getArray<Y.Map<unknown>>("cells");
    if (yCells.length <= 1) return;

    const index = yCells.toArray().findIndex((c) => c.get("id") === cellId);
    if (index < 0) return;

    yCells.delete(index, 1);
    runtimeCellStateRef.current.delete(cellId);

    setState((prev) => ({ ...prev, isDirty: true }));
  }, []);

  const moveCell = useCallback((cellId: string, direction: "up" | "down") => {
    const doc = ydocRef.current;
    if (!doc) return;

    const yCells = doc.getArray<Y.Map<unknown>>("cells");
    const index = yCells.toArray().findIndex((c) => c.get("id") === cellId);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= yCells.length) return;

    const yCell = yCells.get(index);
    yCells.delete(index, 1);
    yCells.insert(targetIndex, [yCell]);

    setState((prev) => ({ ...prev, isDirty: true }));
  }, []);

  const changeCellType = useCallback((cellId: string, type: CellType) => {
    const yCell = yCellByIdRef.current.get(cellId);
    if (!yCell) return;

    yCell.set("type", type);

    const runtime = runtimeCellStateRef.current.get(cellId) ?? { status: "idle" };
    runtime.output = undefined;
    runtime.status = "idle";
    runtime.executionCount = undefined;
    runtimeCellStateRef.current.set(cellId, runtime);

    setState((prev) => ({
      ...prev,
      isDirty: true,
      cells: prev.cells.map((c) => (c.id === cellId ? { ...c, type, output: undefined } : c)),
    }));
  }, []);

  const toggleOutputCollapse = useCallback((cellId: string) => {
    const runtime = runtimeCellStateRef.current.get(cellId);
    if (runtime) runtime.isCollapsed = !runtime.isCollapsed;

    setState((prev) => ({
      ...prev,
      cells: prev.cells.map((cell) =>
        cell.id === cellId ? { ...cell, isCollapsed: !cell.isCollapsed } : cell
      ),
    }));
  }, []);

  const executeCell = useCallback(
    async (cellId: string, advance: boolean = true) => {
      const currentCells = stateRef.current.cells;
      const cell = currentCells.find((c) => c.id === cellId);
      if (!cell) return;

      if (cell.type === "markdown") {
        if (advance) {
          const index = currentCells.findIndex((c) => c.id === cellId);
          const nextCell = currentCells[index + 1];
          if (nextCell) {
            setActiveCell(nextCell.id);
          } else {
            addCell(cellId);
          }
        }
        return;
      }

      const kernel = kernelClientRef.current;
      if (!kernel || !kernel.isLoaded()) {
        setState((prev) => ({
          ...prev,
          cells: prev.cells.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  status: "error",
                  output: {
                    type: "error",
                    content: "Python kernel is not loaded. Please wait for it to initialize.",
                  },
                }
              : c
          ),
        }));
        return;
      }

      const code = getCellYText(cellId)?.toString() ?? cell.content;

      // Set running state
      runtimeCellStateRef.current.set(cellId, {
        ...runtimeCellStateRef.current.get(cellId),
        status: "running",
        output: undefined,
      } as RuntimeCellState);

      setState((prev) => ({
        ...prev,
        kernelStatus: "busy",
        isDirty: true,
        cells: prev.cells.map((c) =>
          c.id === cellId ? { ...c, status: "running", output: undefined } : c
        ),
      }));

      try {
        const output = await kernel.execute(code);
        if (!output || typeof output !== "object" || typeof (output as { type?: unknown }).type !== "string") {
          throw new Error("Kernel returned invalid output");
        }
        const variables = await kernel.getVariables();

        setState((prev) => {
          const nextExecution = prev.executionCounter + 1;
          runtimeCellStateRef.current.set(cellId, {
            ...runtimeCellStateRef.current.get(cellId),
            status: output.type === "error" ? "error" : "success",
            output,
            executionCount: nextExecution,
          } as RuntimeCellState);

          if (advance) {
            const index = prev.cells.findIndex((c) => c.id === cellId);
            const nextCell = prev.cells[index + 1];
            if (nextCell) {
              setTimeout(() => setActiveCell(nextCell.id), 0);
            } else {
              setTimeout(() => addCell(cellId), 0);
            }
          }

          return {
            ...prev,
            kernelStatus: "idle",
            executionCounter: nextExecution,
            variables,
            cells: prev.cells.map((c) =>
              c.id === cellId
                ? {
                    ...c,
                    status: output.type === "error" ? "error" : "success",
                    output,
                    executionCount: nextExecution,
                  }
                : c
            ),
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Execution failed";
        runtimeCellStateRef.current.set(cellId, {
          ...runtimeCellStateRef.current.get(cellId),
          status: "error",
          output: { type: "error", content: message },
        } as RuntimeCellState);

        setState((prev) => ({
          ...prev,
          kernelStatus: "idle",
          cells: prev.cells.map((c) =>
            c.id === cellId ? { ...c, status: "error", output: { type: "error", content: message } } : c
          ),
        }));
      }
    },
    [addCell, getCellYText, setActiveCell]
  );

  const restartKernel = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      kernelStatus: "starting",
      variables: [],
      executionCounter: 0,
      cells: prev.cells.map((c) => ({
        ...c,
        status: "idle",
        output: undefined,
        executionCount: undefined,
      })),
    }));

    runtimeCellStateRef.current.forEach((v) => {
      v.status = "idle";
      v.output = undefined;
      v.executionCount = undefined;
    });

    try {
      const kernel = kernelClientRef.current;
      if (!kernel) throw new Error("Kernel not initialized");
      await kernel.restart();
      setState((prev) => ({ ...prev, kernelStatus: "idle" }));
    } catch (error) {
      console.error("Failed to restart kernel:", error);
      setState((prev) => ({ ...prev, kernelStatus: "idle" }));
    }
  }, []);

  const interruptKernel = useCallback(() => {
    kernelClientRef.current?.interrupt();

    runtimeCellStateRef.current.forEach((v) => {
      if (v.status === "running") v.status = "idle";
    });

    setState((prev) => ({
      ...prev,
      kernelStatus: "idle",
      cells: prev.cells.map((c) => (c.status === "running" ? { ...c, status: "idle" } : c)),
    }));
  }, []);

  const reconnectToKernel = useCallback(async () => {
    kernelClientRef.current = null;
    setKernelKind(null);
    setState((prev) => ({ ...prev, kernelStatus: "loading" }));
    setKernelLoadingMessage("Reconnecting to kernel...");

    try {
      const client = await reconnectKernel((message) => setKernelLoadingMessage(message));
      kernelClientRef.current = client;
      setKernelKind(client.kind);

      setState((prev) => ({
        ...prev,
        kernelStatus: "idle",
        variables: [],
      }));
      setKernelLoadingMessage("");
      return client.kind;
    } catch (error) {
      console.error("Failed to reconnect kernel:", error);
      kernelClientRef.current = null;
      setKernelKind(null);
      setState((prev) => ({ ...prev, kernelStatus: "disconnected" }));
      const errorMsg = error instanceof Error ? error.message : "Failed to reconnect to kernel";
      setKernelLoadingMessage(errorMsg);
      return null;
    }
  }, []);

  const getKernelKind = useCallback(() => kernelKind, [kernelKind]);

  const updateNotebookTitle = useCallback((title: string) => {
    const doc = ydocRef.current;
    if (!doc) return;
    const yTitle = doc.getText("title");
    applyTextDiff(yTitle, title);

    setState((prev) => ({
      ...prev,
      notebookTitle: title,
      isDirty: true,
    }));
  }, []);

  const saveCurrentNotebook = useCallback(async () => {
    const doc = ydocRef.current;
    if (!doc) return;

    const yTitle = doc.getText("title");
    const yCells = doc.getArray<Y.Map<unknown>>("cells");

    const snapshotCells: Cell[] = yCells.toArray().map((yCell) => {
      const id = String(yCell.get("id") ?? generateId());
      const type = asCellType(yCell.get("type"));
      const yText = yCell.get("content") as Y.Text | undefined;
      const content = yText ? yText.toString() : "";
      return { id, type, content, status: "idle" };
    });

    await saveNotebookAsync(notebookId, yTitle.toString() || "Untitled Notebook", snapshotCells, []);
    setState((prev) => ({ ...prev, lastSaved: new Date(), isDirty: false }));
  }, [notebookId]);

  return {
    ...state,
    kernelLoadingMessage,
    kernelKind,
    collabAwareness,
    collabStatus,
    collabPeerCount,
    getCellYText,
    setActiveCell,
    updateCellContent,
    addCell,
    deleteCell,
    moveCell,
    changeCellType,
    toggleOutputCollapse,
    executeCell,
    restartKernel,
    interruptKernel,
    reconnectToKernel,
    getKernelKind,
    updateNotebookTitle,
    saveCurrentNotebook,
  };
}
