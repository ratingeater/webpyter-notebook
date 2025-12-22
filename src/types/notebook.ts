export type CellType = 'code' | 'markdown';

export type CellStatus = 'idle' | 'running' | 'success' | 'error';

export interface OutputItem {
  type: 'text' | 'plot' | 'table' | 'latex' | 'error' | 'html';
  content: string;
  data?: {
    'image/png'?: string;
    'text/html'?: string;
    'text/plain'?: string;
  };
}

export interface CellOutput {
  type: 'text' | 'plot' | 'table' | 'latex' | 'error' | 'html';
  content: string;
  executionTime?: number;
  data?: {
    'image/png'?: string;
    'text/html'?: string;
    'text/plain'?: string;
  };
  // Support multiple outputs like Jupyter
  outputs?: OutputItem[];
}

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  output?: CellOutput;
  status: CellStatus;
  executionCount?: number;
  isCollapsed?: boolean;
}

export interface Variable {
  name: string;
  type: string;
  value: string;
  size?: string;
}

export type KernelStatus = 'idle' | 'busy' | 'disconnected' | 'starting' | 'loading';

export interface NotebookState {
  cells: Cell[];
  activeCellId: string | null;
  kernelStatus: KernelStatus;
  variables: Variable[];
  lastSaved: Date | null;
  isDirty: boolean;
  executionCounter: number;
  notebookId: string;
  notebookTitle: string;
}

export interface NotebookMetadata {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedNotebook {
  metadata: NotebookMetadata;
  cells: Cell[];
  variables: Variable[];
}
