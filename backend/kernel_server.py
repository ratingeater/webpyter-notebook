#!/usr/bin/env python3
"""
Python Kernel Server for Jupyter-ish Notebook
Provides a REST API backend for Python code execution with full Jupyter compatibility.
"""

import sys
import io
import os
import base64
import traceback
import json
import time
import threading
import subprocess
import re
import tempfile
import shutil
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Notebook storage directory
NOTEBOOKS_DIR = Path(os.environ.get('NOTEBOOKS_DIR', '/home/user/notebooks'))
NOTEBOOKS_DIR.mkdir(parents=True, exist_ok=True)

# Working directory for kernel
WORKING_DIR = Path(os.environ.get('KERNEL_WORKING_DIR', '/home/user/workspace'))
WORKING_DIR.mkdir(parents=True, exist_ok=True)
os.chdir(WORKING_DIR)


class KernelState:
    """Global kernel state management"""
    
    def __init__(self):
        self.globals: Dict[str, Any] = {}
        self.execution_count = 0
        self.is_interrupted = False
        self._lock = threading.Lock()
        self.working_dir = WORKING_DIR
        self._init_globals()
    
    def _init_globals(self):
        """Initialize global namespace - mimics Jupyter's behavior"""
        self.globals = {
            '__builtins__': __builtins__,
            '__name__': '__main__',  # This makes if __name__ == "__main__" work!
            '__doc__': None,
            '__package__': None,
            '__file__': '<ipython-input>',
        }
        # Pre-import common modules into namespace
        try:
            import numpy as np
            self.globals['np'] = np
        except ImportError:
            pass
        try:
            import pandas as pd
            self.globals['pd'] = pd
        except ImportError:
            pass
    
    def reset(self):
        """Reset kernel state"""
        with self._lock:
            self._init_globals()
            self.execution_count = 0
            self.is_interrupted = False
    
    def interrupt(self):
        """Set interrupt flag"""
        self.is_interrupted = True
    
    def set_working_dir(self, path: str):
        """Change working directory"""
        new_dir = Path(path).expanduser().resolve()
        if new_dir.exists() and new_dir.is_dir():
            os.chdir(new_dir)
            self.working_dir = new_dir
            return True
        return False


kernel = KernelState()

# Check available features
matplotlib_available = False
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    matplotlib_available = True
except ImportError:
    plt = None

numpy_available = False
try:
    import numpy as np
    numpy_available = True
except ImportError:
    pass

pandas_available = False
try:
    import pandas as pd
    pandas_available = True
except ImportError:
    pass


def get_plot_as_base64() -> Optional[str]:
    """Capture current matplotlib figure as base64 PNG"""
    if not matplotlib_available or plt is None:
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


# ============== Magic Commands ==============

class MagicHandler:
    """Handle Jupyter magic commands"""
    
    @staticmethod
    def handle_line_magic(magic: str, args: str, code_rest: str) -> Optional[Dict[str, Any]]:
        """Handle line magics (%magic)"""
        magic = magic.lower()
        
        if magic == 'pip':
            return MagicHandler._pip(args)
        elif magic == 'cd':
            return MagicHandler._cd(args)
        elif magic == 'pwd':
            return MagicHandler._pwd()
        elif magic == 'ls':
            return MagicHandler._ls(args)
        elif magic == 'cat':
            return MagicHandler._cat(args)
        elif magic == 'run':
            return MagicHandler._run(args)
        elif magic == 'load':
            return MagicHandler._load(args)
        elif magic == 'time':
            return MagicHandler._time(code_rest)
        elif magic == 'timeit':
            return MagicHandler._timeit(args if args else code_rest)
        elif magic == 'who':
            return MagicHandler._who()
        elif magic == 'whos':
            return MagicHandler._whos()
        elif magic == 'reset':
            return MagicHandler._reset()
        elif magic == 'env':
            return MagicHandler._env(args)
        elif magic == 'matplotlib':
            return MagicHandler._matplotlib(args)
        
        return None
    
    @staticmethod
    def handle_cell_magic(magic: str, args: str, body: str) -> Optional[Dict[str, Any]]:
        """Handle cell magics (%%magic)"""
        magic = magic.lower()
        
        if magic == 'bash' or magic == 'sh':
            return MagicHandler._cell_bash(body)
        elif magic == 'python' or magic == 'python3':
            return MagicHandler._cell_python(body)
        elif magic == 'writefile':
            return MagicHandler._cell_writefile(args, body)
        elif magic == 'time':
            return MagicHandler._cell_time(body)
        elif magic == 'timeit':
            return MagicHandler._cell_timeit(body)
        elif magic == 'html':
            return MagicHandler._cell_html(body)
        elif magic == 'javascript' or magic == 'js':
            return MagicHandler._cell_javascript(body)
        elif magic == 'capture':
            return MagicHandler._cell_capture(body)
        
        return None
    
    # Line magic implementations
    @staticmethod
    def _pip(args: str) -> Dict[str, Any]:
        """Handle %pip install"""
        try:
            cmd = [sys.executable, '-m', 'pip'] + args.split()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            output = result.stdout + result.stderr
            return {'output': {'type': 'text', 'content': output}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _cd(args: str) -> Dict[str, Any]:
        """Change directory"""
        path = args.strip() or os.path.expanduser('~')
        try:
            os.chdir(os.path.expanduser(path))
            kernel.working_dir = Path.cwd()
            return {'output': {'type': 'text', 'content': str(Path.cwd())}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _pwd() -> Dict[str, Any]:
        """Print working directory"""
        return {'output': {'type': 'text', 'content': str(Path.cwd())}}
    
    @staticmethod
    def _ls(args: str) -> Dict[str, Any]:
        """List directory contents"""
        try:
            path = Path(args.strip() or '.').expanduser()
            items = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            lines = []
            for item in items:
                prefix = 'd ' if item.is_dir() else 'f '
                lines.append(f"{prefix}{item.name}")
            return {'output': {'type': 'text', 'content': '\n'.join(lines) or '(empty)'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _cat(args: str) -> Dict[str, Any]:
        """Display file contents"""
        try:
            path = Path(args.strip()).expanduser()
            content = path.read_text()
            return {'output': {'type': 'text', 'content': content}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _run(args: str) -> Dict[str, Any]:
        """Run a Python file"""
        try:
            path = Path(args.strip()).expanduser()
            if not path.exists():
                # Try relative to working directory
                path = kernel.working_dir / args.strip()
            code = path.read_text()
            
            # Execute file code using runpy-like behavior
            stdout_capture = io.StringIO()
            stderr_capture = io.StringIO()
            
            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                # Create a fresh namespace for the script but share kernel.globals for results
                script_globals = {
                    '__builtins__': __builtins__,
                    '__name__': '__main__',
                    '__file__': str(path),
                }
                compiled = compile(code, str(path), 'exec')
                exec(compiled, script_globals)
                # Copy defined variables back to kernel globals (except dunder)
                for k, v in script_globals.items():
                    if not k.startswith('__'):
                        kernel.globals[k] = v
            
            output = stdout_capture.getvalue() + stderr_capture.getvalue()
            return {'output': {'type': 'text', 'content': output.rstrip() or f'Executed {path}'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _load(args: str) -> Dict[str, Any]:
        """Load file contents (returns code to be displayed)"""
        try:
            path = Path(args.strip()).expanduser()
            content = path.read_text()
            return {'output': {'type': 'text', 'content': f'# %load {args}\n{content}'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _time(code: str) -> Dict[str, Any]:
        """Time a single statement"""
        start = time.perf_counter()
        result = execute_python_code(code)
        elapsed = time.perf_counter() - start
        
        content = result['output'].get('content', '')
        time_info = f"\nCPU times: {elapsed*1000:.2f} ms"
        result['output']['content'] = content + time_info if content else time_info.strip()
        return result
    
    @staticmethod
    def _timeit(code: str) -> Dict[str, Any]:
        """Time code with multiple runs"""
        import timeit
        try:
            timer = timeit.Timer(code, globals=kernel.globals)
            # Auto-determine number of runs
            number, _ = timer.autorange()
            times = timer.repeat(repeat=3, number=number)
            best = min(times) / number
            
            if best < 1e-6:
                time_str = f"{best*1e9:.2f} ns"
            elif best < 1e-3:
                time_str = f"{best*1e6:.2f} µs"
            elif best < 1:
                time_str = f"{best*1e3:.2f} ms"
            else:
                time_str = f"{best:.2f} s"
            
            return {'output': {'type': 'text', 
                    'content': f"{time_str} ± per loop (mean ± std. dev. of 3 runs, {number} loops each)"}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _who() -> Dict[str, Any]:
        """List variables"""
        skip = {'__builtins__', '__name__', '__doc__', '__package__', '__file__', 
                'np', 'pd', 'plt', 'In', 'Out'}
        names = [n for n in kernel.globals.keys() 
                 if not n.startswith('_') and n not in skip]
        return {'output': {'type': 'text', 'content': '  '.join(sorted(names)) or 'No variables defined'}}
    
    @staticmethod
    def _whos() -> Dict[str, Any]:
        """List variables with details"""
        skip = {'__builtins__', '__name__', '__doc__', '__package__', '__file__',
                'np', 'pd', 'plt', 'In', 'Out'}
        lines = ['Variable   Type       Data/Info', '-' * 40]
        for name, value in sorted(kernel.globals.items()):
            if name.startswith('_') or name in skip:
                continue
            vtype = type(value).__name__
            try:
                info = repr(value)[:30]
            except:
                info = '<unable to display>'
            lines.append(f"{name:<10} {vtype:<10} {info}")
        return {'output': {'type': 'text', 'content': '\n'.join(lines)}}
    
    @staticmethod
    def _reset() -> Dict[str, Any]:
        """Reset namespace"""
        kernel.reset()
        return {'output': {'type': 'text', 'content': 'Namespace reset.'}}
    
    @staticmethod
    def _env(args: str) -> Dict[str, Any]:
        """Get/set environment variables"""
        if '=' in args:
            key, value = args.split('=', 1)
            os.environ[key.strip()] = value.strip()
            return {'output': {'type': 'text', 'content': f'{key}={value}'}}
        elif args.strip():
            value = os.environ.get(args.strip(), '')
            return {'output': {'type': 'text', 'content': value}}
        else:
            envs = '\n'.join(f'{k}={v}' for k, v in sorted(os.environ.items()))
            return {'output': {'type': 'text', 'content': envs}}
    
    @staticmethod
    def _matplotlib(args: str) -> Dict[str, Any]:
        """Configure matplotlib"""
        if 'inline' in args:
            return {'output': {'type': 'text', 'content': 'Matplotlib backend: inline (default)'}}
        return {'output': {'type': 'text', 'content': f'Matplotlib args: {args}'}}
    
    # Cell magic implementations
    @staticmethod
    def _cell_bash(body: str) -> Dict[str, Any]:
        """Execute bash code"""
        try:
            result = subprocess.run(
                body, shell=True, capture_output=True, text=True,
                timeout=120, cwd=str(kernel.working_dir)
            )
            output = result.stdout
            if result.stderr:
                output += result.stderr
            return {'output': {'type': 'text', 'content': output or '(no output)'}}
        except subprocess.TimeoutExpired:
            return {'output': {'type': 'error', 'content': 'Command timed out (120s)'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _cell_python(body: str) -> Dict[str, Any]:
        """Execute Python code (same as normal execution)"""
        return execute_python_code(body)
    
    @staticmethod
    def _cell_writefile(filename: str, body: str) -> Dict[str, Any]:
        """Write cell contents to file"""
        try:
            path = Path(filename.strip()).expanduser()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body)
            return {'output': {'type': 'text', 'content': f'Writing {path}'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    @staticmethod
    def _cell_time(body: str) -> Dict[str, Any]:
        """Time cell execution"""
        start = time.perf_counter()
        result = execute_python_code(body)
        elapsed = time.perf_counter() - start
        
        content = result['output'].get('content', '')
        time_info = f"\nWall time: {elapsed*1000:.2f} ms"
        result['output']['content'] = content + time_info if content else time_info.strip()
        return result
    
    @staticmethod
    def _cell_timeit(body: str) -> Dict[str, Any]:
        """Timeit for cell"""
        return MagicHandler._timeit(body)
    
    @staticmethod
    def _cell_html(body: str) -> Dict[str, Any]:
        """Return HTML content"""
        return {'output': {'type': 'html', 'content': body, 'data': {'text/html': body}}}
    
    @staticmethod
    def _cell_javascript(body: str) -> Dict[str, Any]:
        """Return JavaScript (for display)"""
        return {'output': {'type': 'text', 'content': f'JavaScript:\n{body}'}}
    
    @staticmethod
    def _cell_capture(body: str) -> Dict[str, Any]:
        """Capture output into variable"""
        return execute_python_code(body)


def parse_magic(code: str) -> Tuple[Optional[str], Optional[str], Optional[str], str]:
    """
    Parse magic commands from code.
    Returns: (magic_type, magic_name, magic_args, remaining_code)
    magic_type: 'line', 'cell', or None
    """
    lines = code.split('\n')
    first_line = lines[0].strip()
    
    # Cell magic (%%magic)
    cell_match = re.match(r'^%%(\w+)\s*(.*)?$', first_line)
    if cell_match:
        magic_name = cell_match.group(1)
        magic_args = cell_match.group(2) or ''
        body = '\n'.join(lines[1:])
        return ('cell', magic_name, magic_args, body)
    
    # Line magic (%magic) - only if it's the entire cell or first line
    line_match = re.match(r'^%(\w+)\s*(.*)$', first_line)
    if line_match:
        magic_name = line_match.group(1)
        magic_args = line_match.group(2) or ''
        rest = '\n'.join(lines[1:]) if len(lines) > 1 else ''
        return ('line', magic_name, magic_args, rest)
    
    return (None, None, None, code)


def execute_python_code(code: str) -> Dict[str, Any]:
    """Execute pure Python code (no magic handling)"""
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    result = None
    error_output = None
    plot_data = None
    
    try:
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            # Get last expression for potential result display
            lines = [l for l in code.strip().split('\n') if l.strip() and not l.strip().startswith('#')]
            
            # Try to separate last line if it's a pure expression
            last_line = lines[-1].strip() if lines else ''
            
            # Check if last line is a simple expression (for result display like Jupyter)
            # Exclude: assignments, statements, function calls with no return, etc.
            is_simple_expr = False
            if last_line and not any([
                # Assignment (but not comparison)
                '=' in last_line and not any(op in last_line for op in ['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=']),
                # Statement keywords
                last_line.startswith(('if ', 'for ', 'while ', 'def ', 'class ', 'with ', 'try:', 'except', 'return ', 'import ', 'from ', 'raise ', 'assert ', 'del ', 'pass', 'break', 'continue', 'global ', 'nonlocal ', 'print(', 'print ')),
                # Block start
                last_line.endswith(':'),
            ]):
                # Try to compile as expression to verify
                try:
                    compile(last_line, '<cell>', 'eval')
                    is_simple_expr = True
                except SyntaxError:
                    is_simple_expr = False
            
            if is_simple_expr and len(lines) > 1:
                # Execute all but last line as exec
                code_without_last = '\n'.join(code.strip().split('\n')[:-1])
                if code_without_last.strip():
                    compiled = compile(code_without_last, '<cell>', 'exec')
                    exec(compiled, kernel.globals)
                # Evaluate last line for result
                result = eval(compile(last_line, '<cell>', 'eval'), kernel.globals)
            elif is_simple_expr and len(lines) == 1:
                # Single expression - just eval it
                result = eval(compile(last_line, '<cell>', 'eval'), kernel.globals)
            else:
                # Execute everything as exec (includes print statements, etc.)
                compiled = compile(code, '<cell>', 'exec')
                exec(compiled, kernel.globals)
        
        plot_data = get_plot_as_base64()
        kernel.execution_count += 1
        
    except Exception as e:
        error_output = traceback.format_exc()
    
    stdout_output = stdout_capture.getvalue()
    stderr_output = stderr_capture.getvalue()
    
    if error_output:
        return {'output': {'type': 'error', 'content': error_output}}
    
    if plot_data:
        return {'output': {'type': 'plot', 'content': stdout_output, 
                          'data': {'image/png': plot_data}}}
    
    output_parts = []
    if stdout_output:
        output_parts.append(stdout_output.rstrip())
    if stderr_output:
        output_parts.append(stderr_output.rstrip())
    # Only show result if there's no stdout and result is meaningful
    if result is not None and repr(result) != 'None' and not stdout_output:
        output_parts.append(repr(result))
    
    return {'output': {'type': 'text', 'content': '\n'.join(output_parts)}}


def execute_code(code: str) -> Dict[str, Any]:
    """Main execution entry point - handles all code types"""
    kernel.is_interrupted = False
    code = code.strip()
    
    if not code:
        return {'output': {'type': 'text', 'content': ''}}
    
    # Handle shell commands (!)
    if code.startswith('!'):
        cmd = code[1:].strip()
        # Check for pip specifically
        if cmd.startswith('pip '):
            return MagicHandler._pip(cmd[4:])
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True,
                timeout=120, cwd=str(kernel.working_dir)
            )
            output = result.stdout + result.stderr
            kernel.execution_count += 1
            return {'output': {'type': 'text', 'content': output or '(no output)'}}
        except Exception as e:
            return {'output': {'type': 'error', 'content': str(e)}}
    
    # Parse and handle magic commands
    magic_type, magic_name, magic_args, remaining = parse_magic(code)
    
    if magic_type == 'cell':
        result = MagicHandler.handle_cell_magic(magic_name, magic_args, remaining)
        if result:
            kernel.execution_count += 1
            return result
    elif magic_type == 'line':
        result = MagicHandler.handle_line_magic(magic_name, magic_args, remaining)
        if result:
            kernel.execution_count += 1
            return result
    
    # Regular Python execution
    return execute_python_code(code)


def get_variables() -> List[Dict[str, Any]]:
    """Get all user-defined variables"""
    skip_names = {'__builtins__', '__name__', '__doc__', '__package__', '__file__',
                  'sys', 'io', 'os', 'base64', 'matplotlib', 'plt', 'json',
                  'np', 'pd', 'numpy', 'pandas', 'In', 'Out'}
    
    variables = []
    for name, value in kernel.globals.items():
        if name.startswith('_') or name in skip_names:
            continue
        if callable(value) and not isinstance(value, type):
            continue
        
        try:
            var_type = type(value).__name__
            size = None
            if hasattr(value, 'shape'):
                size = str(value.shape)
            elif hasattr(value, '__len__') and not isinstance(value, str):
                try:
                    size = f"{len(value)} items"
                except:
                    pass
            
            val_str = repr(value)
            if len(val_str) > 100:
                val_str = val_str[:100] + '...'
            
            variables.append({
                'name': name,
                'type': var_type,
                'value': val_str,
                'size': size
            })
        except:
            pass
    
    return variables


# ============== Notebook File Management ==============

def save_notebook_file(notebook_id: str, data: dict) -> Path:
    """Save notebook to .ipynb file"""
    filepath = NOTEBOOKS_DIR / f"{notebook_id}.ipynb"
    
    # Convert to Jupyter notebook format
    nb = {
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": sys.version.split()[0]
            },
            "title": data.get('title', 'Untitled'),
            "created": data.get('created', datetime.now().isoformat()),
            "modified": datetime.now().isoformat()
        },
        "nbformat": 4,
        "nbformat_minor": 5,
        "cells": []
    }
    
    for cell in data.get('cells', []):
        nb_cell = {
            "cell_type": cell.get('type', 'code'),
            "metadata": {},
            "source": cell.get('content', '').split('\n'),
        }
        if cell.get('type') == 'code':
            nb_cell["execution_count"] = cell.get('executionCount')
            nb_cell["outputs"] = []
            if cell.get('output'):
                output = cell['output']
                if output.get('type') == 'error':
                    nb_cell["outputs"].append({
                        "output_type": "error",
                        "ename": "Error",
                        "evalue": "",
                        "traceback": output.get('content', '').split('\n')
                    })
                elif output.get('type') == 'plot':
                    nb_cell["outputs"].append({
                        "output_type": "display_data",
                        "data": output.get('data', {}),
                        "metadata": {}
                    })
                else:
                    nb_cell["outputs"].append({
                        "output_type": "stream",
                        "name": "stdout",
                        "text": output.get('content', '').split('\n')
                    })
        
        nb["cells"].append(nb_cell)
    
    filepath.write_text(json.dumps(nb, indent=2))
    return filepath


def load_notebook_file(notebook_id: str) -> Optional[dict]:
    """Load notebook from .ipynb file"""
    filepath = NOTEBOOKS_DIR / f"{notebook_id}.ipynb"
    if not filepath.exists():
        return None
    
    try:
        nb = json.loads(filepath.read_text())
        
        cells = []
        for nb_cell in nb.get('cells', []):
            cell = {
                'id': str(hash(str(nb_cell.get('source', ''))))[:8],
                'type': nb_cell.get('cell_type', 'code'),
                'content': '\n'.join(nb_cell.get('source', [])) if isinstance(nb_cell.get('source'), list) else nb_cell.get('source', ''),
                'status': 'idle',
            }
            if nb_cell.get('execution_count'):
                cell['executionCount'] = nb_cell['execution_count']
            
            # Convert outputs
            outputs = nb_cell.get('outputs', [])
            if outputs:
                out = outputs[0]
                if out.get('output_type') == 'error':
                    cell['output'] = {
                        'type': 'error',
                        'content': '\n'.join(out.get('traceback', []))
                    }
                elif out.get('output_type') == 'display_data':
                    cell['output'] = {
                        'type': 'plot',
                        'content': '',
                        'data': out.get('data', {})
                    }
                else:
                    text = out.get('text', [])
                    cell['output'] = {
                        'type': 'text',
                        'content': '\n'.join(text) if isinstance(text, list) else text
                    }
            
            cells.append(cell)
        
        return {
            'id': notebook_id,
            'title': nb.get('metadata', {}).get('title', 'Untitled'),
            'cells': cells,
            'created': nb.get('metadata', {}).get('created'),
            'modified': nb.get('metadata', {}).get('modified')
        }
    except Exception as e:
        print(f"Error loading notebook: {e}")
        return None


def list_notebooks() -> List[dict]:
    """List all saved notebooks"""
    notebooks = []
    for filepath in NOTEBOOKS_DIR.glob('*.ipynb'):
        try:
            nb = json.loads(filepath.read_text())
            meta = nb.get('metadata', {})
            notebooks.append({
                'id': filepath.stem,
                'title': meta.get('title', filepath.stem),
                'modified': meta.get('modified', ''),
                'created': meta.get('created', '')
            })
        except:
            pass
    return sorted(notebooks, key=lambda x: x.get('modified', ''), reverse=True)


# ============== API Routes ==============

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'ok': True,
        'name': 'Jupyter-ish Kernel Server',
        'message': 'Backend kernel ready',
        'python_version': sys.version,
        'working_dir': str(kernel.working_dir),
        'notebooks_dir': str(NOTEBOOKS_DIR),
        'features': {
            'matplotlib': matplotlib_available,
            'numpy': numpy_available,
            'pandas': pandas_available,
            'pip_install': True,
            'shell_commands': True,
            'cell_magics': ['%%bash', '%%python', '%%writefile', '%%time', '%%timeit', '%%html'],
            'line_magics': ['%pip', '%cd', '%pwd', '%ls', '%run', '%time', '%timeit', '%who', '%whos', '%env'],
            'notebook_storage': True
        }
    })


@app.route('/execute', methods=['POST'])
def execute():
    """Execute Python code"""
    data = request.get_json()
    if not data or 'code' not in data:
        return jsonify({'error': 'No code provided'}), 400
    
    result = execute_code(data['code'])
    return jsonify(result)


@app.route('/variables', methods=['GET'])
def variables():
    """Get current variables"""
    return jsonify({'variables': get_variables()})


@app.route('/restart', methods=['POST'])
def restart():
    """Restart the kernel"""
    kernel.reset()
    return jsonify({'ok': True})


@app.route('/interrupt', methods=['POST'])
def interrupt():
    """Interrupt current execution"""
    kernel.interrupt()
    return jsonify({'ok': True})


@app.route('/notebooks', methods=['GET'])
def get_notebooks():
    """List all notebooks"""
    return jsonify({'notebooks': list_notebooks()})


@app.route('/notebooks/<notebook_id>', methods=['GET'])
def get_notebook(notebook_id):
    """Get a specific notebook"""
    nb = load_notebook_file(notebook_id)
    if nb:
        return jsonify({'notebook': nb})
    return jsonify({'error': 'Notebook not found'}), 404


@app.route('/notebooks/<notebook_id>', methods=['PUT', 'POST'])
def save_notebook(notebook_id):
    """Save a notebook"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    filepath = save_notebook_file(notebook_id, data)
    return jsonify({
        'ok': True,
        'id': notebook_id,
        'path': str(filepath)
    })


@app.route('/notebooks/<notebook_id>', methods=['DELETE'])
def delete_notebook(notebook_id):
    """Delete a notebook"""
    filepath = NOTEBOOKS_DIR / f"{notebook_id}.ipynb"
    if filepath.exists():
        filepath.unlink()
        return jsonify({'ok': True})
    return jsonify({'error': 'Notebook not found'}), 404


@app.route('/notebooks/<notebook_id>/download', methods=['GET'])
def download_notebook(notebook_id):
    """Download notebook as .ipynb file"""
    filepath = NOTEBOOKS_DIR / f"{notebook_id}.ipynb"
    if filepath.exists():
        return send_file(filepath, as_attachment=True, download_name=f"{notebook_id}.ipynb")
    return jsonify({'error': 'Notebook not found'}), 404


@app.route('/files', methods=['GET'])
def list_files():
    """List files in working directory"""
    path = request.args.get('path', '.')
    try:
        target = (kernel.working_dir / path).resolve()
        items = []
        for item in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            items.append({
                'name': item.name,
                'type': 'directory' if item.is_dir() else 'file',
                'size': item.stat().st_size if item.is_file() else None,
                'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat()
            })
        return jsonify({
            'path': str(target),
            'items': items
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/files/<path:filepath>', methods=['GET'])
def read_file(filepath):
    """Read a file"""
    try:
        target = (kernel.working_dir / filepath).resolve()
        if target.is_file():
            # Check if it's a text file
            try:
                content = target.read_text()
                return jsonify({'content': content, 'path': str(target)})
            except:
                # Binary file - return base64
                content = base64.b64encode(target.read_bytes()).decode()
                return jsonify({'content': content, 'path': str(target), 'binary': True})
        return jsonify({'error': 'Not a file'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/files/<path:filepath>', methods=['PUT', 'POST'])
def write_file(filepath):
    """Write to a file"""
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({'error': 'No content provided'}), 400
    
    try:
        target = (kernel.working_dir / filepath).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(data['content'])
        return jsonify({'ok': True, 'path': str(target)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/cwd', methods=['GET'])
def get_cwd():
    """Get current working directory"""
    return jsonify({'cwd': str(kernel.working_dir)})


@app.route('/cwd', methods=['POST'])
def set_cwd():
    """Set current working directory"""
    data = request.get_json()
    path = data.get('path', '')
    if kernel.set_working_dir(path):
        return jsonify({'ok': True, 'cwd': str(kernel.working_dir)})
    return jsonify({'error': 'Invalid path'}), 400


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Jupyter-ish Kernel Server')
    parser.add_argument('--port', type=int, default=5000, help='Port to run on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to')
    args = parser.parse_args()
    
    print(f"Starting Jupyter-ish Kernel Server on {args.host}:{args.port}")
    print(f"Working directory: {kernel.working_dir}")
    print(f"Notebooks directory: {NOTEBOOKS_DIR}")
    print(f"Features: matplotlib={matplotlib_available}, numpy={numpy_available}, pandas={pandas_available}")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
