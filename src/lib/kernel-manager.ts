import type { KernelClient } from '@/lib/kernel-client';
import { 
  createBackendKernelClient, 
  resetBackendKernelState, 
  getBackendKernelUrl,
  getKernelMode,
  isBackendKernelMode
} from '@/lib/backend-kernel-client';
import { createPyodideKernelClient } from '@/lib/pyodide-kernel-client';

export async function selectKernelClient(onProgress?: (msg: string) => void): Promise<KernelClient> {
  const mode = getKernelMode();
  
  // Strict mode selection - no automatic fallback
  if (mode === 'backend') {
    const url = getBackendKernelUrl();
    if (!url) {
      onProgress?.('Backend URL not configured. Please set it in Settings.');
      throw new Error('Backend kernel URL is not configured. Please configure it in Settings.');
    }
    
    const backend = createBackendKernelClient();
    onProgress?.(`Connecting to backend kernel (${url})...`);
    
    try {
      await backend.init();
      onProgress?.('Connected to backend kernel (full Python with pip support)');
      return backend;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      onProgress?.(`Failed to connect to backend: ${errorMsg}`);
      throw new Error(`Failed to connect to backend kernel at ${url}: ${errorMsg}`);
    }
  }
  
  // Pyodide mode
  const pyodide = createPyodideKernelClient();
  onProgress?.('Loading Pyodide kernel (browser-based, limited packages)...');
  await pyodide.init(onProgress);
  onProgress?.('Pyodide kernel ready (browser-based)');
  return pyodide;
}

// Force reconnect to kernel (used when settings change)
export async function reconnectKernel(onProgress?: (msg: string) => void): Promise<KernelClient> {
  // Reset backend state first
  resetBackendKernelState();
  
  return selectKernelClient(onProgress);
}

// Export for external use
export { getKernelMode, isBackendKernelMode };
