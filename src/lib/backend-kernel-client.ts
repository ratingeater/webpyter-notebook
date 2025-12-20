import type { CellOutput, KernelClient, KernelVariable } from '@/lib/kernel-client';

let backendReady = false;
let currentBaseUrl = '';

export type KernelMode = 'backend' | 'pyodide';

// Get the selected kernel mode from settings
export function getKernelMode(): KernelMode {
  try {
    const savedSettings = localStorage.getItem('jupyter-ish-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.kernelMode === 'pyodide') {
        return 'pyodide';
      }
    }
  } catch {
    // Ignore parse errors
  }
  return 'backend'; // Default to backend mode
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
  return envUrl?.trim() ? envUrl.trim().replace(/\/$/, '') : '';
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

export function createBackendKernelClient(): KernelClient {
  return {
    kind: 'backend',
    init: async () => {
      const url = getBackendKernelUrl();
      if (!url) throw new Error('Backend kernel URL is not configured');
      currentBaseUrl = url;
      const data = await fetchJson<BackendKernelHandshakeResponse>('/health');
      if (!data?.ok) throw new Error(data?.message || 'Backend kernel health check failed');
      backendReady = true;
    },
    isLoaded: () => backendReady,
    execute: async (code: string) => {
      const data = await fetchJson<BackendKernelExecuteResponse>('/execute', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      return data.output;
    },
    getVariables: async () => {
      const data = await fetchJson<BackendKernelVariablesResponse>('/variables');
      return data.variables;
    },
    restart: async () => {
      const data = await fetchJson<BackendKernelRestartResponse>('/restart', { method: 'POST' });
      if (!data.ok) throw new Error('Restart failed');
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
