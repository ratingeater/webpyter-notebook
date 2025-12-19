import type { KernelClient } from '@/lib/kernel-client';
import { createBackendKernelClient, isBackendKernelConfigured } from '@/lib/backend-kernel-client';
import { createPyodideKernelClient } from '@/lib/pyodide-kernel-client';

export async function selectKernelClient(onProgress?: (msg: string) => void): Promise<KernelClient> {
  // Prefer backend if configured and reachable.
  if (isBackendKernelConfigured()) {
    const backend = createBackendKernelClient();
    try {
      onProgress?.('Connecting to backend kernel...');
      await backend.init();
      onProgress?.('Connected to backend kernel');
      return backend;
    } catch (e) {
      console.warn('Backend kernel unavailable; falling back to Pyodide.', e);
    }
  }

  const pyodide = createPyodideKernelClient();
  onProgress?.('Loading local Python kernel...');
  await pyodide.init(onProgress);
  onProgress?.('Local Python kernel ready');
  return pyodide;
}
