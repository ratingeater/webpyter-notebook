import type { CellOutput, KernelClient, KernelVariable } from '@/lib/kernel-client';

let backendReady = false;
let currentBaseUrl = '';

export type KernelMode = 'backend' | 'pyodide';

function isLocalHostname(hostname: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}

function shouldIgnoreEnvBackendUrl(envUrl: string): boolean {
  if (!envUrl) return false;
  try {
    const parsed = new URL(envUrl);
    if (!isLocalHostname(parsed.hostname)) return false;

    // If the app is not running on localhost, ignore a localhost default backend URL.
    const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : '';
    return !isLocalHostname(runtimeHost);
  } catch {
    return false;
  }
}

// Get the selected kernel mode from settings
export function getKernelMode(): KernelMode {
  try {
    const savedSettings = localStorage.getItem('jupyter-ish-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.kernelMode === 'backend' || settings.kernelMode === 'pyodide') return settings.kernelMode;
    }
  } catch {
    // Ignore parse errors
  }

  const envDefault = import.meta.env.VITE_DEFAULT_KERNEL_MODE;
  if (envDefault === 'backend' || envDefault === 'pyodide') return envDefault;

  // Default based on availability: prefer backend if configured, else Pyodide.
  return getBackendKernelUrl() ? 'backend' : 'pyodide';
}

// Get backend URL from settings or environment variable
export function getBackendKernelUrl(): string {
  // First check localStorage settings
  try {
    const savedSettings = localStorage.getItem('jupyter-ish-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.backendKernelUrl?.trim()) {
        return settings.backendKernelUrl.trim().replace(/\/$/, '');
      }
    }
  } catch {
    // Ignore parse errors
  }
  
  // Fall back to environment variable
  const envUrl = import.meta.env.VITE_BACKEND_KERNEL_URL as string | undefined;
  const normalized = envUrl?.trim() ? envUrl.trim().replace(/\/$/, '') : '';
  if (shouldIgnoreEnvBackendUrl(normalized)) return '';
  return normalized;
}

// Check if backend kernel mode is selected
export function isBackendKernelMode(): boolean {
  return getKernelMode() === 'backend';
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = currentBaseUrl || getBackendKernelUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Backend kernel request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export type BackendKernelHandshakeResponse = {
  ok: boolean;
  name?: string;
  message?: string;
  python_version?: string;
  features?: Record<string, unknown>;
  endpoints?: Record<string, unknown>;
};

export type BackendKernelExecuteResponse = {
  output: CellOutput;
};

export type BackendKernelVariablesResponse = {
  variables: KernelVariable[];
};

export type BackendKernelRestartResponse = {
  ok: boolean;
};

export type BackendKernelInterruptResponse = {
  ok: boolean;
};

export function isBackendKernelConfigured() {
  return isBackendKernelMode() && !!getBackendKernelUrl();
}

const VALID_OUTPUT_TYPES = new Set<CellOutput['type']>([
  'text',
  'plot',
  'table',
  'latex',
  'error',
  'html',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeCollabWorker(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const endpoints = payload.endpoints;
  if (isRecord(endpoints) && (typeof endpoints.websocket === 'string' || typeof endpoints.health === 'string')) {
    return true;
  }
  const message = payload.message;
  return typeof message === 'string' && message.toLowerCase().includes('collaboration worker');
}

function assertCellOutput(value: unknown): asserts value is CellOutput {
  if (!isRecord(value)) throw new Error('Backend returned invalid output (not an object)');
  const type = value.type;
  const content = value.content;
  if (typeof type !== 'string' || !VALID_OUTPUT_TYPES.has(type as CellOutput['type'])) {
    throw new Error('Backend returned invalid output.type');
  }
  if (typeof content !== 'string') {
    throw new Error('Backend returned invalid output.content');
  }
}

export function createBackendKernelClient(): KernelClient {
  return {
    kind: 'backend',
    init: async () => {
      const url = getBackendKernelUrl();
      if (!url) throw new Error('Backend kernel URL is not configured');
      currentBaseUrl = url;
      const data = await fetchJson<BackendKernelHandshakeResponse>('/health');
      if (!data?.ok) throw new Error(data?.message || 'Backend kernel health check failed');
      if (looksLikeCollabWorker(data)) {
        throw new Error(
          'Backend URL points to the collaboration Worker (WebSocket API), not a Python kernel server. ' +
            'Set the backend URL to your Python kernel server (e.g. http(s)://host:5000) and configure collaboration separately via VITE_COLLAB_WS_URL.'
        );
      }
      backendReady = true;
    },
    isLoaded: () => backendReady,
    execute: async (code: string) => {
      const data = await fetchJson<BackendKernelExecuteResponse | Record<string, unknown>>('/execute', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (looksLikeCollabWorker(data)) {
        throw new Error(
          'Backend URL points to the collaboration Worker (WebSocket API), not a Python kernel server. ' +
            'Please set the backend URL to your Python kernel server.'
        );
      }
      const output = (data as BackendKernelExecuteResponse).output;
      assertCellOutput(output);
      return output;
    },
    getVariables: async () => {
      const data = await fetchJson<BackendKernelVariablesResponse | Record<string, unknown>>('/variables');
      if (looksLikeCollabWorker(data)) {
        throw new Error(
          'Backend URL points to the collaboration Worker (WebSocket API), not a Python kernel server. ' +
            'Please set the backend URL to your Python kernel server.'
        );
      }
      const variables = (data as BackendKernelVariablesResponse).variables;
      if (!Array.isArray(variables)) {
        throw new Error('Backend returned invalid variables payload');
      }
      return variables;
    },
    restart: async () => {
      const data = await fetchJson<BackendKernelRestartResponse | Record<string, unknown>>('/restart', {
        method: 'POST',
      });
      if (looksLikeCollabWorker(data)) {
        throw new Error(
          'Backend URL points to the collaboration Worker (WebSocket API), not a Python kernel server. ' +
            'Please set the backend URL to your Python kernel server.'
        );
      }
      if (!(data as BackendKernelRestartResponse).ok) throw new Error('Restart failed');
      backendReady = true;
    },
    interrupt: () => {
      const url = currentBaseUrl || getBackendKernelUrl();
      if (!url) return;
      // fire-and-forget
      fetch(`${url}/interrupt`, { method: 'POST' }).catch(() => undefined);
    },
  };
}

// Reset backend state (for reconnection)
export function resetBackendKernelState() {
  backendReady = false;
  currentBaseUrl = '';
}
