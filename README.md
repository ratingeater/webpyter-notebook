# Jupyter-ish Notebook

A modern, web-based Jupyter-like notebook application with full Python backend support.

## Features

- **Backend Python Kernel**: Full Python environment with pip install support
- **Pyodide Fallback**: Browser-based Python (limited packages) when backend unavailable
- **Jupyter Magic Commands**: Support for `%%bash`, `%%python`, `%pip`, `%run`, etc.
- **Real-time Variable Inspector**: View all defined variables
- **Auto-save**: Automatic notebook saving
- **Dark Theme**: Beautiful dark theme optimized for coding
- **Monaco Editor**: VS Code-like editing experience

## Quick Start

### Using the Deployment Script (Recommended)

```bash
# Start both frontend and backend in development mode
./deploy.sh

# Or start in production mode
./deploy.sh prod

# Stop all services
./deploy.sh stop

# Check status
./deploy.sh status
```

### Manual Setup

#### Backend Setup

```bash
# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start the kernel server
python kernel_server.py --port 5000
```

#### Frontend Setup

```bash
# Install Node.js dependencies
npm install

# Start development server
npm run dev

# Or build for production
npm run build
npm run preview
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_BACKEND_KERNEL_URL=http://localhost:5000
```

### Deployment Script Options

```bash
# Custom ports
BACKEND_PORT=8000 FRONTEND_PORT=3000 ./deploy.sh

# Custom directories
NOTEBOOKS_DIR=/path/to/notebooks WORKSPACE_DIR=/path/to/workspace ./deploy.sh
```

## Architecture

```
webapp/
├── backend/
│   ├── kernel_server.py    # Python kernel server (Flask)
│   └── requirements.txt    # Python dependencies
├── src/
│   ├── components/         # React components
│   │   └── notebook/       # Notebook UI components
│   ├── hooks/              # React hooks
│   │   └── useNotebook.ts  # Main notebook state management
│   └── lib/                # Core libraries
│       ├── kernel-manager.ts       # Kernel selection logic
│       ├── backend-kernel-client.ts # Backend API client
│       └── pyodide-kernel-client.ts # Pyodide kernel client
├── deploy.sh               # Deployment script
└── package.json            # Frontend dependencies
```

## Supported Features

### Backend Kernel (Full Python)

- All Python packages (install with `pip install`)
- Shell commands (`!ls`, `!pip install`, etc.)
- Cell magics: `%%bash`, `%%python`, `%%writefile`, `%%time`, `%%timeit`, `%%html`
- Line magics: `%pip`, `%cd`, `%pwd`, `%ls`, `%run`, `%time`, `%timeit`, `%who`, `%whos`, `%env`
- Matplotlib plots
- Notebook file storage (.ipynb format)

### Pyodide Kernel (Browser-based)

- Pre-bundled packages: numpy, pandas, matplotlib
- No installation required
- Works offline

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift + Enter` | Run cell and advance |
| `Ctrl + Enter` | Run cell without advancing |
| `Ctrl + S` | Save notebook |
| `Escape` | Exit edit mode |

## License

MIT License
