import { useState, useCallback, useEffect, useRef } from 'react';
import { Cell, CellType, NotebookState } from '@/types/notebook';
import type { KernelClient } from '@/lib/kernel-client';
import { selectKernelClient, reconnectKernel } from '@/lib/kernel-manager';
import {
  getNotebook,
  saveNotebook,
  saveNotebookAsync,
  createNewNotebook,
  getCurrentNotebookId,
  setCurrentNotebookId,
  setUseBackendStorage,
} from '@/lib/notebook-storage';

const generateId = () => Math.random().toString(36).substring(2, 11);

const createCell = (type: CellType = 'code', content: string = ''): Cell => ({
  id: generateId(),
  type,
  content,
  status: 'idle',
});

const getInitialState = (): NotebookState => {
  // Try to load current notebook
  const currentId = getCurrentNotebookId();
  if (currentId) {
    const notebook = getNotebook(currentId);
    if (notebook) {
      return {
        cells: notebook.cells,
        activeCellId: null,
        kernelStatus: 'disconnected',
        variables: [],
        lastSaved: notebook.metadata.updatedAt,
        isDirty: false,
        executionCounter: 0,
        notebookId: notebook.metadata.id,
        notebookTitle: notebook.metadata.title,
      };
    }
  }

  // Create new notebook
  const newNotebook = createNewNotebook();
  return {
    cells: newNotebook.cells,
    activeCellId: null,
    kernelStatus: 'disconnected',
    variables: [],
    lastSaved: newNotebook.metadata.updatedAt,
    isDirty: false,
    executionCounter: 0,
    notebookId: newNotebook.metadata.id,
    notebookTitle: newNotebook.metadata.title,
  };
};

export function useNotebook() {
  const [state, setState] = useState<NotebookState>(getInitialState);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const [kernelLoadingMessage, setKernelLoadingMessage] = useState<string>('');
  const [kernelKind, setKernelKind] = useState<'backend' | 'pyodide' | null>(null);
  const kernelClientRef = useRef<KernelClient | null>(null);

  // Keep a ref to current state for callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Keep a ref for kernel kind as well (for use in callbacks)
  const kernelKindRef = useRef(kernelKind);
  kernelKindRef.current = kernelKind;

  // Initialize kernel on mount
  useEffect(() => {
    const initKernel = async () => {
      // Delay kernel loading to let UI render first (use requestIdleCallback if available)
      const startLoading = () => {
        setState((prev) => ({ ...prev, kernelStatus: 'loading' }));

        selectKernelClient((message) => setKernelLoadingMessage(message))
          .then((client) => {
            kernelClientRef.current = client;
            setKernelKind(client.kind);
            // Enable backend storage when connected to backend
            setUseBackendStorage(client.kind === 'backend');
            setState((prev) => ({ ...prev, kernelStatus: 'idle' }));
            setKernelLoadingMessage('');
          })
          .catch((error) => {
            console.error('Failed to initialize kernel:', error);
            kernelClientRef.current = null;
            setKernelKind(null);
            setUseBackendStorage(false);
            setState((prev) => ({ ...prev, kernelStatus: 'disconnected' }));
            // Show error message to user
            const errorMsg = error instanceof Error ? error.message : 'Failed to connect to kernel';
            setKernelLoadingMessage(errorMsg);
          });
      };

      if ('requestIdleCallback' in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(startLoading);
      } else {
        setTimeout(startLoading, 100);
      }
    };

    initKernel();
  }, []);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (state.isDirty) {
        // Use async save to support backend storage
        saveNotebookAsync(
          state.notebookId,
          state.notebookTitle,
          state.cells,
          state.variables
        ).then(() => {
          setState((prev) => ({
            ...prev,
            lastSaved: new Date(),
            isDirty: false,
          }));
        });
      }
    }, 30000);

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
      }
    };
  }, [state.isDirty, state.notebookId, state.notebookTitle, state.cells, state.variables]);

  const setActiveCell = useCallback((cellId: string | null) => {
    setState(prev => ({ ...prev, activeCellId: cellId }));
  }, []);

  const updateCellContent = useCallback((cellId: string, content: string) => {
    setState(prev => ({
      ...prev,
      isDirty: true,
      cells: prev.cells.map(cell =>
        cell.id === cellId ? { ...cell, content } : cell
      ),
    }));
  }, []);

  const addCell = useCallback((afterCellId: string | null, type: CellType = 'code') => {
    const newCell = createCell(type);
    setState(prev => {
      const index = afterCellId
        ? prev.cells.findIndex(c => c.id === afterCellId) + 1
        : prev.cells.length;
      const newCells = [...prev.cells];
      newCells.splice(index, 0, newCell);
      return {
        ...prev,
        cells: newCells,
        activeCellId: newCell.id,
        isDirty: true,
      };
    });
    return newCell.id;
  }, []);

  const deleteCell = useCallback((cellId: string) => {
    setState(prev => {
      if (prev.cells.length <= 1) return prev;
      const index = prev.cells.findIndex(c => c.id === cellId);
      const newCells = prev.cells.filter(c => c.id !== cellId);
      const newActiveId = newCells[Math.min(index, newCells.length - 1)]?.id || null;
      return {
        ...prev,
        cells: newCells,
        activeCellId: newActiveId,
        isDirty: true,
      };
    });
  }, []);

  const moveCell = useCallback((cellId: string, direction: 'up' | 'down') => {
    setState(prev => {
      const index = prev.cells.findIndex(c => c.id === cellId);
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === prev.cells.length - 1)
      ) {
        return prev;
      }
      const newCells = [...prev.cells];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newCells[index], newCells[targetIndex]] = [newCells[targetIndex], newCells[index]];
      return { ...prev, cells: newCells, isDirty: true };
    });
  }, []);

  const changeCellType = useCallback((cellId: string, type: CellType) => {
    setState(prev => ({
      ...prev,
      isDirty: true,
      cells: prev.cells.map(cell =>
        cell.id === cellId ? { ...cell, type, output: undefined } : cell
      ),
    }));
  }, []);

  const toggleOutputCollapse = useCallback((cellId: string) => {
    setState(prev => ({
      ...prev,
      cells: prev.cells.map(cell =>
        cell.id === cellId ? { ...cell, isCollapsed: !cell.isCollapsed } : cell
      ),
    }));
  }, []);

  const executeCell = useCallback(
    async (cellId: string, advance: boolean = true) => {
      // Use ref to get current cells to avoid stale closure
      const currentCells = stateRef.current.cells;

      const cell = currentCells.find((c) => c.id === cellId);
      if (!cell || cell.type === 'markdown') {
        if (advance) {
          const index = currentCells.findIndex((c) => c.id === cellId);
          const nextCell = currentCells[index + 1];
          if (nextCell) {
            setActiveCell(nextCell.id);
          } else {
            addCell(cellId);
          }
        }
        return;
      }

      const kernel = kernelClientRef.current;
      if (!kernel || !kernel.isLoaded()) {
        setState((prev) => ({
          ...prev,
          cells: prev.cells.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  status: 'error',
                  output: {
                    type: 'error',
                    content: 'Python kernel is not loaded. Please wait for it to initialize.',
                  },
                }
              : c
          ),
        }));
        return;
      }

      // Set running state and get latest content
      let latestContent = cell.content;
      setState((prev) => {
        const latestCell = prev.cells.find((c) => c.id === cellId);
        if (latestCell) {
          latestContent = latestCell.content;
        }
        return {
          ...prev,
          kernelStatus: 'busy',
          cells: prev.cells.map((c) =>
            c.id === cellId ? { ...c, status: 'running', output: undefined } : c
          ),
        };
      });

      try {
        const kernel = kernelClientRef.current;
        if (!kernel) throw new Error('Kernel not initialized');

        // Execute code (backend preferred, Pyodide fallback)
        const output = await kernel.execute(latestContent);

        // Get updated variables
        const variables = await kernel.getVariables();

        setState((prev) => {
          // Handle advance logic inside setState to use latest state
          if (advance) {
            const index = prev.cells.findIndex((c) => c.id === cellId);
            const nextCell = prev.cells[index + 1];
            if (nextCell) {
              // Schedule setActiveCell after state update
              setTimeout(() => setActiveCell(nextCell.id), 0);
            } else {
              // Schedule addCell after state update
              setTimeout(() => addCell(cellId), 0);
            }
          }

          return {
            ...prev,
            kernelStatus: 'idle',
            executionCounter: prev.executionCounter + 1,
            variables,
            cells: prev.cells.map((c) =>
              c.id === cellId
                ? {
                    ...c,
                    status: output.type === 'error' ? 'error' : 'success',
                    output,
                    executionCount: prev.executionCounter + 1,
                  }
                : c
            ),
          };
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          kernelStatus: 'idle',
          cells: prev.cells.map((c) =>
            c.id === cellId
              ? {
                  ...c,
                  status: 'error',
                  output: {
                    type: 'error',
                    content:
                      error instanceof Error ? error.message : 'Execution failed',
                  },
                }
              : c
          ),
        }));
      }
    },
    [state.cells, setActiveCell, addCell]
  );

  const restartKernel = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      kernelStatus: 'starting',
      variables: [],
      cells: prev.cells.map((c) => ({
        ...c,
        status: 'idle',
        output: undefined,
        executionCount: undefined,
      })),
    }));

    try {
      const kernel = kernelClientRef.current;
      if (!kernel) throw new Error('Kernel not initialized');
      await kernel.restart();
      setState((prev) => ({ ...prev, kernelStatus: 'idle', executionCounter: 0 }));
    } catch (error) {
      console.error('Failed to restart kernel:', error);
      setState((prev) => ({ ...prev, kernelStatus: 'idle' }));
    }
  }, []);

  const interruptKernel = useCallback(() => {
    kernelClientRef.current?.interrupt();

    // Update UI state
    setState((prev) => ({
      ...prev,
      kernelStatus: 'idle',
      cells: prev.cells.map((c) =>
        c.status === 'running' ? { ...c, status: 'idle' } : c
      ),
    }));
  }, []);

  // Reconnect to kernel (used when settings change)
  const reconnectToKernel = useCallback(async () => {
    // Immediately update UI to show we're reconnecting
    kernelClientRef.current = null;
    setKernelKind(null);
    setState((prev) => ({ ...prev, kernelStatus: 'loading' }));
    setKernelLoadingMessage('Reconnecting to kernel...');

    try {
      const client = await reconnectKernel((message) => setKernelLoadingMessage(message));
      kernelClientRef.current = client;
      setKernelKind(client.kind);
      
      // Enable backend storage when connected to backend
      setUseBackendStorage(client.kind === 'backend');
      
      // Update state
      setState((prev) => ({ 
        ...prev, 
        kernelStatus: 'idle',
        variables: [], // Clear variables on reconnect
      }));
      setKernelLoadingMessage('');
      
      return client.kind;
    } catch (error) {
      console.error('Failed to reconnect kernel:', error);
      kernelClientRef.current = null;
      setKernelKind(null);
      setUseBackendStorage(false);
      setState((prev) => ({ ...prev, kernelStatus: 'disconnected' }));
      const errorMsg = error instanceof Error ? error.message : 'Failed to reconnect to kernel';
      setKernelLoadingMessage(errorMsg);
      return null;
    }
  }, []);

  // Get current kernel kind (for external use, returns from ref for immediate access)
  const getKernelKind = useCallback(() => kernelKind, [kernelKind]);

  const reorderCells = useCallback((startIndex: number, endIndex: number) => {
    setState((prev) => {
      const newCells = [...prev.cells];
      const [removed] = newCells.splice(startIndex, 1);
      newCells.splice(endIndex, 0, removed);
      return { ...prev, cells: newCells, isDirty: true };
    });
  }, []);

  const createNotebook = useCallback(() => {
    const newNotebook = createNewNotebook();
    setState({
      cells: newNotebook.cells,
      activeCellId: null,
      kernelStatus: kernelClientRef.current?.isLoaded() ? 'idle' : 'disconnected',
      variables: [],
      lastSaved: newNotebook.metadata.updatedAt,
      isDirty: false,
      executionCounter: 0,
      notebookId: newNotebook.metadata.id,
      notebookTitle: newNotebook.metadata.title,
    });
    return newNotebook.metadata.id;
  }, []);

  const loadNotebook = useCallback((notebookId: string) => {
    const notebook = getNotebook(notebookId);
    if (notebook) {
      setCurrentNotebookId(notebookId);
      setState({
        cells: notebook.cells,
        activeCellId: null,
        kernelStatus: kernelClientRef.current?.isLoaded() ? 'idle' : 'disconnected',
        variables: [],
        lastSaved: notebook.metadata.updatedAt,
        isDirty: false,
        executionCounter: 0,
        notebookId: notebook.metadata.id,
        notebookTitle: notebook.metadata.title,
      });
    }
  }, []);

  const updateNotebookTitle = useCallback((title: string) => {
    setState((prev) => ({
      ...prev,
      notebookTitle: title,
      isDirty: true,
    }));
  }, []);

  const saveCurrentNotebook = useCallback(async () => {
    await saveNotebookAsync(
      state.notebookId,
      state.notebookTitle,
      state.cells,
      state.variables
    );
    setState((prev) => ({
      ...prev,
      lastSaved: new Date(),
      isDirty: false,
    }));
  }, [state.notebookId, state.notebookTitle, state.cells, state.variables]);

  return {
    ...state,
    kernelLoadingMessage,
    kernelKind,
    setActiveCell,
    updateCellContent,
    addCell,
    deleteCell,
    moveCell,
    changeCellType,
    toggleOutputCollapse,
    executeCell,
    restartKernel,
    interruptKernel,
    reconnectToKernel,
    getKernelKind,
    reorderCells,
    createNotebook,
    loadNotebook,
    updateNotebookTitle,
    saveCurrentNotebook,
  };
}
