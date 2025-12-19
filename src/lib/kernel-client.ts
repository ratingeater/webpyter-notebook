export type KernelStatus = 'disconnected' | 'loading' | 'idle' | 'busy' | 'starting';

export type CellOutput =
  | { type: 'text'; content: string }
  | { type: 'plot'; content: string }
  | { type: 'error'; content: string };

export type KernelVariable = {
  name: string;
  type: string;
  value: string;
};

export type KernelClient = {
  kind: 'pyodide' | 'backend';
  init: (onProgress?: (message: string) => void) => Promise<void>;
  isLoaded: () => boolean;
  execute: (code: string) => Promise<CellOutput>;
  getVariables: () => Promise<KernelVariable[]>;
  restart: () => Promise<void>;
  interrupt: () => void;
};
