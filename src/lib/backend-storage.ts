/**
 * Backend storage client for notebook management
 * When connected to backend, notebooks are saved to the server
 */

import { Cell, NotebookMetadata, SavedNotebook, Variable } from '@/types/notebook';
import { getBackendKernelUrl, isBackendKernelMode } from './backend-kernel-client';

export interface BackendNotebookMeta {
  id: string;
  title: string;
  modified: string;
  created: string;
}

export interface BackendNotebook {
  id: string;
  title: string;
  cells: Cell[];
  created?: string;
  modified?: string;
}

async function fetchBackend<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getBackendKernelUrl();
  if (!baseUrl) {
    throw new Error('Backend URL not configured');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if backend storage is available
 */
export function isBackendStorageAvailable(): boolean {
  return isBackendKernelMode() && !!getBackendKernelUrl();
}

/**
 * List all notebooks from backend
 */
export async function listBackendNotebooks(): Promise<NotebookMetadata[]> {
  const data = await fetchBackend<{ notebooks: BackendNotebookMeta[] }>('/notebooks');
  return data.notebooks.map((nb) => ({
    id: nb.id,
    title: nb.title,
    createdAt: nb.created ? new Date(nb.created) : new Date(),
    updatedAt: nb.modified ? new Date(nb.modified) : new Date(),
  }));
}

/**
 * Get a notebook from backend
 */
export async function getBackendNotebook(id: string): Promise<SavedNotebook | null> {
  try {
    const data = await fetchBackend<{ notebook: BackendNotebook }>(`/notebooks/${id}`);
    return {
      metadata: {
        id: data.notebook.id,
        title: data.notebook.title,
        createdAt: data.notebook.created ? new Date(data.notebook.created) : new Date(),
        updatedAt: data.notebook.modified ? new Date(data.notebook.modified) : new Date(),
      },
      cells: data.notebook.cells,
      variables: [],
    };
  } catch {
    return null;
  }
}

/**
 * Save notebook to backend
 */
export async function saveBackendNotebook(
  id: string,
  title: string,
  cells: Cell[],
  variables: Variable[]
): Promise<{ ok: boolean; id: string; path?: string }> {
  return fetchBackend(`/notebooks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      cells: cells.map((cell) => ({
        id: cell.id,
        type: cell.type,
        content: cell.content,
        status: cell.status,
        output: cell.output,
        executionCount: cell.executionCount,
      })),
      variables,
    }),
  });
}

/**
 * Delete notebook from backend
 */
export async function deleteBackendNotebook(id: string): Promise<void> {
  await fetchBackend(`/notebooks/${id}`, { method: 'DELETE' });
}

/**
 * Download notebook as .ipynb from backend
 */
export function getNotebookDownloadUrl(id: string): string {
  const baseUrl = getBackendKernelUrl();
  return `${baseUrl}/notebooks/${id}/download`;
}

/**
 * Get current working directory from backend
 */
export async function getBackendCwd(): Promise<string> {
  const data = await fetchBackend<{ cwd: string }>('/cwd');
  return data.cwd;
}

/**
 * Set current working directory on backend
 */
export async function setBackendCwd(path: string): Promise<string> {
  const data = await fetchBackend<{ ok: boolean; cwd: string }>('/cwd', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return data.cwd;
}

/**
 * List files in directory
 */
export async function listBackendFiles(path: string = '.'): Promise<{
  path: string;
  items: Array<{
    name: string;
    type: 'file' | 'directory';
    size: number | null;
    modified: string;
  }>;
}> {
  return fetchBackend(`/files?path=${encodeURIComponent(path)}`);
}

/**
 * Read file from backend
 */
export async function readBackendFile(filepath: string): Promise<{
  content: string;
  path: string;
  binary?: boolean;
}> {
  return fetchBackend(`/files/${encodeURIComponent(filepath)}`);
}

/**
 * Write file to backend
 */
export async function writeBackendFile(filepath: string, content: string): Promise<{
  ok: boolean;
  path: string;
}> {
  return fetchBackend(`/files/${encodeURIComponent(filepath)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}
