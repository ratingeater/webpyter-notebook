import { CellOutput, Variable } from '@/types/notebook';

// Worker instance
let worker: Worker | null = null;
let isReady = false;
let initPromise: Promise<void> | null = null;

// Pending requests
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

// Progress callback
let progressCallback: ((message: string) => void) | null = null;

// Generate unique request ID
const generateRequestId = () => Math.random().toString(36).substring(2, 15);

// Create and initialize the worker
function createWorker(): Worker {
  // Create worker using inline worker code for better compatibility
  const workerCode = `
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';

let pyodide = null;
const loadedPackages = new Set();

async function initPyodide() {
  try {
    self.postMessage({ type: 'progress', message: 'Loading Pyodide runtime...' });

    importScripts(PYODIDE_CDN + 'pyodide.js');

    self.postMessage({ type: 'progress', message: 'Initializing Python environment...' });
    
    pyodide = await self.loadPyodide({
      indexURL: PYODIDE_CDN,
    });

    self.postMessage({ type: 'progress', message: 'Setting up Python environment...' });

    await pyodide.runPythonAsync(\`
import sys
import io
import base64

class OutputCapture:
    def __init__(self):
        self.outputs = []
        self.current = io.StringIO()
    
    def write(self, text):
        self.current.write(text)
    
    def flush(self):
        pass
    
    def get_output(self):
        return self.current.getvalue()
    
    def reset(self):
        self.current = io.StringIO()

_output_capture = OutputCapture()
sys.stdout = _output_capture
sys.stderr = _output_capture

_matplotlib_loaded = False
plt = None

def _ensure_matplotlib():
    global _matplotlib_loaded, plt
    if not _matplotlib_loaded:
        import matplotlib
        matplotlib.use('AGG')
        import matplotlib.pyplot as _plt
        plt = _plt
        _matplotlib_loaded = True
    return plt

def _get_plot_as_base64():
    global plt
    if plt is None:
        return None
    if plt.get_fignums():
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', 
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        return img_base64
    return None

def _get_output():
    output = _output_capture.get_output()
    _output_capture.reset()
    return output
\`);

    self.postMessage({ type: 'progress', message: 'Python kernel ready!' });
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

async function executeCode(id, code) {
  if (!pyodide) {
    self.postMessage({ type: 'error', id, error: 'Pyodide not initialized' });
    return;
  }

  const startTime = performance.now();

  try {
    const needsMatplotlib = code.includes('matplotlib') || code.includes('plt.') || code.includes('import plt');
    if (needsMatplotlib && !loadedPackages.has('matplotlib')) {
      await pyodide.loadPackagesFromImports('import matplotlib');
      await pyodide.runPythonAsync('_ensure_matplotlib()');
      loadedPackages.add('matplotlib');
    }
    
    const needsNumpy = code.includes('numpy') || code.includes('np.');
    if (needsNumpy && !loadedPackages.has('numpy')) {
      await pyodide.loadPackagesFromImports('import numpy');
      loadedPackages.add('numpy');
    }
    
    const needsPandas = code.includes('pandas') || code.includes('pd.');
    if (needsPandas && !loadedPackages.has('pandas')) {
      await pyodide.loadPackagesFromImports('import pandas');
      loadedPackages.add('pandas');
    }
    
    await pyodide.loadPackagesFromImports(code);

    const result = await pyodide.runPythonAsync(code);

    const stdout = await pyodide.runPythonAsync('_get_output()');

    const plotBase64 = await pyodide.runPythonAsync('_get_plot_as_base64()');

    const executionTime = performance.now() - startTime;

    if (plotBase64) {
      self.postMessage({
        type: 'executeResult',
        id,
        result: {
          type: 'plot',
          content: '',
          executionTime,
          data: {
            'image/png': plotBase64,
          },
        },
      });
      return;
    }

    let outputContent = stdout;
    if (result !== undefined && result !== null) {
      const resultStr = String(result);
      if (resultStr !== 'None' && resultStr !== 'undefined') {
        outputContent = outputContent ? outputContent + '\\n' + resultStr : resultStr;
      }
    }

    self.postMessage({
      type: 'executeResult',
      id,
      result: {
        type: 'text',
        content: outputContent || '',
        executionTime,
      },
    });
  } catch (error) {
    const executionTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const cleanError = errorMessage
      .replace(/PythonError: /g, '')
      .replace(/Traceback \\(most recent call last\\):/g, 'Traceback (most recent call last):');

    self.postMessage({
      type: 'executeResult',
      id,
      result: {
        type: 'error',
        content: cleanError,
        executionTime,
      },
    });
  }
}

async function getVariables(id) {
  if (!pyodide) {
    self.postMessage({ type: 'variablesResult', id, variables: [] });
    return;
  }

  try {
    const result = await pyodide.runPythonAsync(\`
import json

def _get_variables():
    variables = []
    for name, value in globals().items():
        if not name.startswith('_') and not callable(value) and not name in ['sys', 'io', 'base64', 'matplotlib', 'plt', 'json']:
            try:
                var_type = type(value).__name__
                
                size = None
                if hasattr(value, 'shape'):
                    size = str(value.shape)
                elif hasattr(value, '__len__') and not isinstance(value, str):
                    size = f"{len(value)} items"
                
                try:
                    val_str = repr(value)
                    if len(val_str) > 100:
                        val_str = val_str[:100] + '...'
                except:
                    val_str = '<unable to display>'
                
                variables.append({
                    'name': name,
                    'type': var_type,
                    'value': val_str,
                    'size': size
                })
            except:
                pass
    return json.dumps(variables)

_get_variables()
\`);

    self.postMessage({ type: 'variablesResult', id, variables: JSON.parse(result) });
  } catch {
    self.postMessage({ type: 'variablesResult', id, variables: [] });
  }
}

async function restartKernel(id) {
  if (!pyodide) {
    self.postMessage({ type: 'restartComplete', id });
    return;
  }

  try {
    await pyodide.runPythonAsync(\`
for name in list(globals().keys()):
    if not name.startswith('_') and name not in ['sys', 'io', 'base64', 'matplotlib', 'plt', 'json', 'OutputCapture']:
        del globals()[name]

_output_capture.reset()

if plt is not None:
    plt.close('all')
\`);
    self.postMessage({ type: 'restartComplete', id });
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

self.onmessage = async (event) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      await initPyodide();
      break;
    case 'execute':
      await executeCode(message.id, message.code);
      break;
    case 'getVariables':
      await getVariables(message.id);
      break;
    case 'restart':
      await restartKernel(message.id);
      break;
  }
};
`;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const newWorker = new Worker(workerUrl);
  
  newWorker.onmessage = (event) => {
    const message = event.data;
    
    switch (message.type) {
      case 'progress':
        progressCallback?.(message.message);
        break;
        
      case 'ready':
        isReady = true;
        break;
        
      case 'executeResult': {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message.result);
          pendingRequests.delete(message.id);
        }
        break;
      }
      
      case 'variablesResult': {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message.variables);
          pendingRequests.delete(message.id);
        }
        break;
      }
      
      case 'restartComplete': {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(undefined);
          pendingRequests.delete(message.id);
        }
        break;
      }
      
      case 'error': {
        if (message.id) {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            pending.reject(new Error(message.error));
            pendingRequests.delete(message.id);
          }
        } else {
          console.error('Worker error:', message.error);
        }
        break;
      }
    }
  };
  
  newWorker.onerror = (error) => {
    console.error('Worker error:', error);
    // Reject all pending requests
    pendingRequests.forEach((pending) => {
      pending.reject(new Error('Worker error'));
    });
    pendingRequests.clear();
  };
  
  return newWorker;
}

export async function loadPyodideKernel(
  onProgress?: (message: string) => void
): Promise<void> {
  if (isReady && worker) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  progressCallback = onProgress || null;

  initPromise = new Promise<void>((resolve, reject) => {
    try {
      worker = createWorker();
      
      // Set up a one-time listener for the ready message
      const readyHandler = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          isReady = true;
          resolve();
        } else if (event.data.type === 'error' && !event.data.id) {
          reject(new Error(event.data.error));
        }
      };
      
      // The main onmessage handler will also catch 'ready', but we need this for the promise
      const originalOnMessage = worker.onmessage;
      worker.onmessage = (event) => {
        readyHandler(event);
        if (originalOnMessage) {
          originalOnMessage.call(worker, event);
        }
      };
      
      // Start initialization
      worker.postMessage({ type: 'init' });
    } catch (error) {
      reject(error);
    }
  });

  return initPromise;
}

export async function executeCode(code: string): Promise<CellOutput> {
  if (!worker || !isReady) {
    throw new Error('Pyodide not initialized');
  }

  const id = generateRequestId();
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { 
      resolve: resolve as (value: unknown) => void, 
      reject 
    });
    worker!.postMessage({ type: 'execute', id, code });
  });
}

export async function getVariables(): Promise<Variable[]> {
  if (!worker || !isReady) {
    return [];
  }

  const id = generateRequestId();
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { 
      resolve: resolve as (value: unknown) => void, 
      reject 
    });
    worker!.postMessage({ type: 'getVariables', id });
  });
}

export async function restartKernel(): Promise<void> {
  if (!worker || !isReady) {
    return;
  }

  const id = generateRequestId();
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { 
      resolve: resolve as (value: unknown) => void, 
      reject 
    });
    worker!.postMessage({ type: 'restart', id });
  });
}

export function isKernelLoaded(): boolean {
  return isReady && worker !== null;
}

// Terminate the worker (for cleanup)
export function terminateKernel(): void {
  if (worker) {
    worker.terminate();
    worker = null;
    isReady = false;
    initPromise = null;
    pendingRequests.clear();
  }
}
