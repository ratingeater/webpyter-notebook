import type { KernelClient } from '@/lib/kernel-client';
import {
  executeCode,
  getVariables,
  isKernelLoaded,
  loadPyodideKernel,
  restartKernel,
} from '@/lib/pyodide-kernel';

export function createPyodideKernelClient(): KernelClient {
  return {
    kind: 'pyodide',
    init: async (onProgress) => {
      if (isKernelLoaded()) return;
      await loadPyodideKernel((msg) => onProgress?.(msg));
    },
    isLoaded: () => isKernelLoaded(),
    execute: (code) => executeCode(code),
    getVariables: () => getVariables(),
    restart: () => restartKernel(),
    interrupt: () => {
      // Pyodide doesn't support true interruption.
    },
  };
}
