import { CellOutput, Variable } from '@/types/notebook';

// Pyodide types
interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<void>;
  globals: {
    get: (name: string) => unknown;
    toJs: () => Map<string, unknown>;
  };
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string, options?: { encoding: string }) => string | Uint8Array;
  };
  runPython: (code: string) => unknown;
}

declare global {
  interface Window {
    loadPyodide: (config?: { indexURL?: string }) => Promise<PyodideInterface>;
  }
}

let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';

// Helper to yield to main thread to prevent blocking
const yieldToMain = () => new Promise<void>(resolve => {
  // Use setTimeout with 0 for faster yielding while still allowing UI updates
  setTimeout(resolve, 0);
});

// Longer yield for heavy operations
const yieldToMainLong = () => new Promise<void>(resolve => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => resolve(), { timeout: 100 });
  } else {
    setTimeout(resolve, 16); // ~1 frame
  }
});

export async function loadPyodideKernel(
  onProgress?: (message: string) => void
): Promise<PyodideInterface> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    onProgress?.('Loading Pyodide runtime...');
    
    // Yield to allow UI to update
    await yieldToMain();

    // Load Pyodide script if not already loaded
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${PYODIDE_CDN}pyodide.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide'));
        document.head.appendChild(script);
      });
    }
    
    await yieldToMain();

    onProgress?.('Initializing Python environment...');
    pyodideInstance = await window.loadPyodide({
      indexURL: PYODIDE_CDN,
    });
    
    await yieldToMain();

    // Setup basic Python environment first (fast)
    onProgress?.('Setting up Python environment...');
    
    await pyodideInstance.runPythonAsync(`
import sys
import io
import base64

# Capture stdout
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

# Matplotlib will be loaded lazily
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
    """Get current matplotlib figure as base64 PNG"""
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
    """Get captured stdout"""
    output = _output_capture.get_output()
    _output_capture.reset()
    return output
`);

    onProgress?.('Python kernel ready!');
    return pyodideInstance;
  })();

  return loadingPromise;
}

// Cache for loaded packages to avoid re-checking
const loadedPackages = new Set<string>();

export async function executeCode(code: string): Promise<CellOutput> {
  const startTime = performance.now();

  if (!pyodideInstance) {
    throw new Error('Pyodide not initialized');
  }

  try {
    // Yield before heavy operations
    await yieldToMain();
    
    // Check if matplotlib is being used and ensure it's loaded
    const needsMatplotlib = code.includes('matplotlib') || code.includes('plt.') || code.includes('import plt');
    if (needsMatplotlib && !loadedPackages.has('matplotlib')) {
      await pyodideInstance.loadPackagesFromImports('import matplotlib');
      await pyodideInstance.runPythonAsync('_ensure_matplotlib()');
      loadedPackages.add('matplotlib');
      await yieldToMainLong();
    }
    
    // Check for numpy
    const needsNumpy = code.includes('numpy') || code.includes('np.');
    if (needsNumpy && !loadedPackages.has('numpy')) {
      await pyodideInstance.loadPackagesFromImports('import numpy');
      loadedPackages.add('numpy');
      await yieldToMainLong();
    }
    
    // Load any other required packages (but skip already loaded ones)
    await pyodideInstance.loadPackagesFromImports(code);
    await yieldToMain();

    // Execute the code
    const result = await pyodideInstance.runPythonAsync(code);
    
    // Yield after execution to allow UI updates
    await yieldToMain();

    // Get stdout output
    const stdout = await pyodideInstance.runPythonAsync('_get_output()') as string;

    // Check for matplotlib plots
    const plotBase64 = await pyodideInstance.runPythonAsync('_get_plot_as_base64()') as string | null;

    const executionTime = performance.now() - startTime;

    if (plotBase64) {
      return {
        type: 'plot',
        content: '',
        executionTime,
        data: {
          'image/png': plotBase64,
        },
      };
    }

    // Format the result
    let outputContent = stdout;
    if (result !== undefined && result !== null) {
      const resultStr = String(result);
      if (resultStr !== 'None' && resultStr !== 'undefined') {
        outputContent = outputContent ? `${outputContent}\n${resultStr}` : resultStr;
      }
    }

    return {
      type: 'text',
      content: outputContent || '',
      executionTime,
    };
  } catch (error) {
    const executionTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Clean up the error message
    const cleanError = errorMessage
      .replace(/PythonError: /g, '')
      .replace(/Traceback \(most recent call last\):/g, 'Traceback (most recent call last):');

    return {
      type: 'error',
      content: cleanError,
      executionTime,
    };
  }
}

export async function getVariables(): Promise<Variable[]> {
  if (!pyodideInstance) {
    return [];
  }

  try {
    const result = await pyodideInstance.runPythonAsync(`
import json

def _get_variables():
    variables = []
    for name, value in globals().items():
        if not name.startswith('_') and not callable(value) and not name in ['sys', 'io', 'base64', 'matplotlib', 'plt', 'json']:
            try:
                var_type = type(value).__name__
                
                # Get size for arrays/lists
                size = None
                if hasattr(value, 'shape'):
                    size = str(value.shape)
                elif hasattr(value, '__len__') and not isinstance(value, str):
                    size = f"{len(value)} items"
                
                # Get string representation (truncated)
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
`) as string;

    return JSON.parse(result);
  } catch {
    return [];
  }
}

export async function restartKernel(): Promise<void> {
  if (pyodideInstance) {
    // Clear all user-defined variables
    await pyodideInstance.runPythonAsync(`
# Clear user variables
for name in list(globals().keys()):
    if not name.startswith('_') and name not in ['sys', 'io', 'base64', 'matplotlib', 'plt', 'json', 'OutputCapture']:
        del globals()[name]

# Reset output capture
_output_capture.reset()

# Close all plots
plt.close('all')
`);
  }
}

export function isKernelLoaded(): boolean {
  return pyodideInstance !== null;
}
