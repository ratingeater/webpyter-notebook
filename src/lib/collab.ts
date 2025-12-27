function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeWebSocketUrl(value: string): string {
  const trimmed = stripTrailingSlashes(value.trim());
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice("https://".length)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice("http://".length)}`;
  return trimmed;
}

export type CollabConfig = {
  serverUrl: string;
  params?: Record<string, string>;
  connectTimeoutMs: number;
};

export const COLLAB_CONFIG_CHANGED_EVENT = "jupyter-ish-collab-config-changed";

export function notifyCollabConfigChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COLLAB_CONFIG_CHANGED_EVENT));
}

function readAppSettings(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("jupyter-ish-settings");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getCollabConfig(): CollabConfig | null {
  const settings = readAppSettings();

  const runtimeEnabled = asOptionalBoolean(settings?.collabEnabled);
  if (runtimeEnabled === false) return null;

  const runtimeUrl = asOptionalString(settings?.collabServerUrl)?.trim() ?? "";
  const runtimeToken = asOptionalString(settings?.collabToken)?.trim() ?? "";
  const runtimeTimeout = asOptionalNumber(settings?.collabConnectTimeoutMs);

  const envUrl = (import.meta.env.VITE_COLLAB_WS_URL as string | undefined)?.trim() ?? "";
  const envToken = (import.meta.env.VITE_COLLAB_TOKEN as string | undefined)?.trim() ?? "";
  const enabled = runtimeEnabled ?? !!envUrl;

  if (!enabled) return null;

  const rawUrl = runtimeUrl || envUrl;
  if (!rawUrl) return null;

  const serverUrl = normalizeWebSocketUrl(rawUrl);
  const token = runtimeToken || envToken;
  const params = token ? { token } : undefined;

  const timeoutRaw = (import.meta.env.VITE_COLLAB_CONNECT_TIMEOUT_MS as string | undefined)?.trim() ?? "";
  const timeoutEnv = timeoutRaw ? Number(timeoutRaw) : NaN;
  const timeoutEffective =
    runtimeTimeout != null ? runtimeTimeout : Number.isFinite(timeoutEnv) ? timeoutEnv : 2000;
  const connectTimeoutMs = Math.max(0, Math.floor(timeoutEffective));

  return { serverUrl, params, connectTimeoutMs };
}
