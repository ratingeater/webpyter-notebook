import type { CellOutput, Variable } from '@/types/notebook';

export type KernelStatus = 'disconnected' | 'loading' | 'idle' | 'busy' | 'starting';

export type KernelVariable = Variable;

export type { CellOutput };

export type KernelClient = {
  kind: 'pyodide' | 'backend';
  init: (onProgress?: (message: string) => void) => Promise<void>;
  isLoaded: () => boolean;
  execute: (code: string) => Promise<CellOutput>;
  getVariables: () => Promise<KernelVariable[]>;
  restart: () => Promise<void>;
  interrupt: () => void;
};
