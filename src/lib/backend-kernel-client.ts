import type { CellOutput, KernelClient, KernelVariable } from '@/lib/kernel-client';

let backendReady = false;

const baseUrl = (() => {
  const v = import.meta.env.VITE_BACKEND_KERNEL_URL as string | undefined;
  return v?.trim() ? v.trim().replace(/\/$/, '') : '';
})();

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
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
  return !!baseUrl;
}

export function createBackendKernelClient(): KernelClient {
  return {
    kind: 'backend',
    init: async () => {
      if (!baseUrl) throw new Error('VITE_BACKEND_KERNEL_URL is not configured');
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
    },
    interrupt: () => {
      if (!baseUrl) return;
      // fire-and-forget
      fetch(`${baseUrl}/interrupt`, { method: 'POST' }).catch(() => undefined);
    },
  };
}
