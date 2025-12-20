import { Cell, NotebookMetadata, SavedNotebook, Variable } from '@/types/notebook';
import {
  isBackendStorageAvailable,
  listBackendNotebooks,
  getBackendNotebook,
  saveBackendNotebook,
  deleteBackendNotebook,
} from './backend-storage';

const STORAGE_KEY = 'jupyter-ish-notebooks';
const CURRENT_NOTEBOOK_KEY = 'jupyter-ish-current-notebook';

// Track storage mode
let useBackendStorage = false;

export function setUseBackendStorage(value: boolean) {
  useBackendStorage = value;
}

export function getUseBackendStorage(): boolean {
  return useBackendStorage && isBackendStorageAvailable();
}

export function generateNotebookId(): string {
  return `nb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getAllNotebooks(): NotebookMetadata[] {
  // Local storage only - use getAllNotebooksAsync for backend support
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const notebooks = JSON.parse(data) as Record<string, SavedNotebook>;
    return Object.values(notebooks).map((nb) => ({
      ...nb.metadata,
      createdAt: new Date(nb.metadata.createdAt),
      updatedAt: new Date(nb.metadata.updatedAt),
    }));
  } catch {
    return [];
  }
}

export async function getAllNotebooksAsync(): Promise<NotebookMetadata[]> {
  if (getUseBackendStorage()) {
    try {
      return await listBackendNotebooks();
    } catch (e) {
      console.warn('Failed to list notebooks from backend:', e);
    }
  }
  return getAllNotebooks();
}

export function getNotebook(id: string): SavedNotebook | null {
  // Local storage only - use getNotebookAsync for backend support
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const notebooks = JSON.parse(data) as Record<string, SavedNotebook>;
    const notebook = notebooks[id];
    if (!notebook) return null;
    return {
      ...notebook,
      metadata: {
        ...notebook.metadata,
        createdAt: new Date(notebook.metadata.createdAt),
        updatedAt: new Date(notebook.metadata.updatedAt),
      },
    };
  } catch {
    return null;
  }
}

export async function getNotebookAsync(id: string): Promise<SavedNotebook | null> {
  if (getUseBackendStorage()) {
    try {
      return await getBackendNotebook(id);
    } catch (e) {
      console.warn('Failed to get notebook from backend:', e);
    }
  }
  return getNotebook(id);
}

export function saveNotebook(
  id: string,
  title: string,
  cells: Cell[],
  variables: Variable[]
): SavedNotebook {
  const data = localStorage.getItem(STORAGE_KEY);
  const notebooks: Record<string, SavedNotebook> = data ? JSON.parse(data) : {};

  const existingNotebook = notebooks[id];
  const now = new Date();

  const notebook: SavedNotebook = {
    metadata: {
      id,
      title,
      createdAt: existingNotebook?.metadata.createdAt
        ? new Date(existingNotebook.metadata.createdAt)
        : now,
      updatedAt: now,
    },
    cells: cells.map((cell) => ({
      ...cell,
      output: undefined, // Don't save outputs to localStorage
      status: 'idle',
      executionCount: undefined,
    })),
    variables: [], // Don't save variables
  };

  notebooks[id] = notebook;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));

  return notebook;
}

export async function saveNotebookAsync(
  id: string,
  title: string,
  cells: Cell[],
  variables: Variable[]
): Promise<SavedNotebook> {
  // Always save to localStorage as backup
  const localNotebook = saveNotebook(id, title, cells, variables);
  
  // Also save to backend if available (with outputs for persistence)
  if (getUseBackendStorage()) {
    try {
      await saveBackendNotebook(id, title, cells, variables);
    } catch (e) {
      console.warn('Failed to save notebook to backend:', e);
    }
  }
  
  return localNotebook;
}

export function deleteNotebook(id: string): void {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return;

  const notebooks: Record<string, SavedNotebook> = JSON.parse(data);
  delete notebooks[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
}

export async function deleteNotebookAsync(id: string): Promise<void> {
  deleteNotebook(id);
  
  if (getUseBackendStorage()) {
    try {
      await deleteBackendNotebook(id);
    } catch (e) {
      console.warn('Failed to delete notebook from backend:', e);
    }
  }
}

export function renameNotebook(id: string, newTitle: string): void {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return;

  const notebooks: Record<string, SavedNotebook> = JSON.parse(data);
  if (notebooks[id]) {
    notebooks[id].metadata.title = newTitle;
    notebooks[id].metadata.updatedAt = new Date();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));
  }
}

export function getCurrentNotebookId(): string | null {
  return localStorage.getItem(CURRENT_NOTEBOOK_KEY);
}

export function setCurrentNotebookId(id: string): void {
  localStorage.setItem(CURRENT_NOTEBOOK_KEY, id);
}

export function createNewNotebook(): SavedNotebook {
  const id = generateNotebookId();
  const now = new Date();

  const defaultCells: Cell[] = [
    {
      id: Math.random().toString(36).substring(2, 11),
      type: 'markdown',
      content:
        '# New Notebook\n\nWelcome to your new notebook! Start writing code below.',
      status: 'idle',
    },
    {
      id: Math.random().toString(36).substring(2, 11),
      type: 'code',
      content: '# Write your Python code here\n# Press Shift+Enter to execute',
      status: 'idle',
    },
  ];

  const notebook: SavedNotebook = {
    metadata: {
      id,
      title: 'Untitled Notebook',
      createdAt: now,
      updatedAt: now,
    },
    cells: defaultCells,
    variables: [],
  };

  // Save to storage
  const data = localStorage.getItem(STORAGE_KEY);
  const notebooks: Record<string, SavedNotebook> = data ? JSON.parse(data) : {};
  notebooks[id] = notebook;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks));

  // Set as current
  setCurrentNotebookId(id);

  return notebook;
}

export function exportNotebookAsIpynb(
  title: string,
  cells: Cell[]
): string {
  const ipynb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.11',
      },
    },
    cells: cells.map((cell) => ({
      cell_type: cell.type === 'code' ? 'code' : 'markdown',
      metadata: {},
      source: cell.content.split('\n'),
      ...(cell.type === 'code'
        ? {
            execution_count: cell.executionCount || null,
            outputs: cell.output
              ? [
                  {
                    output_type: cell.output.type === 'error' ? 'error' : 'stream',
                    name: cell.output.type === 'error' ? 'stderr' : 'stdout',
                    text: cell.output.content.split('\n'),
                  },
                ]
              : [],
          }
        : {}),
    })),
  };

  return JSON.stringify(ipynb, null, 2);
}

export function importNotebookFromIpynb(content: string): Cell[] {
  try {
    const ipynb = JSON.parse(content);
    return ipynb.cells.map((cell: { cell_type: string; source: string | string[] }) => ({
      id: Math.random().toString(36).substring(2, 11),
      type: cell.cell_type === 'code' ? 'code' : 'markdown',
      content: Array.isArray(cell.source) ? cell.source.join('\n') : cell.source,
      status: 'idle' as const,
    }));
  } catch {
    throw new Error('Invalid notebook format');
  }
}
