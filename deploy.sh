#!/bin/bash
#
# Jupyter-ish Notebook Deployment Script
# Quickly deploy both frontend and backend services
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default ports
BACKEND_PORT=${BACKEND_PORT:-5000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}
WORKER_PORT=${WORKER_PORT:-8787}

# Optional collab mode (starts Worker+DO locally and configures frontend to connect)
ENABLE_COLLAB=${ENABLE_COLLAB:-0}

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
NOTEBOOKS_DIR="${NOTEBOOKS_DIR:-$HOME/notebooks}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$HOME/workspace}"

# PID files
BACKEND_PID_FILE="/tmp/jupyter-ish-backend.pid"
FRONTEND_PID_FILE="/tmp/jupyter-ish-frontend.pid"
WORKER_PID_FILE="/tmp/jupyter-ish-worker.pid"

print_header() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           Jupyter-ish Notebook Deployment                  ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Upsert KEY=VALUE into .env (preserves other lines/comments)
upsert_env_var() {
    local key="$1"
    local value="$2"
    python - "$key" "$value" <<'PY'
import re
import sys
from pathlib import Path

key, value = sys.argv[1], sys.argv[2]
path = Path(".env")
lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []

out = []
found = False
pattern = re.compile(rf"^{re.escape(key)}=")
for line in lines:
    if pattern.match(line):
        out.append(f"{key}={value}")
        found = True
    else:
        out.append(line)

if not found:
    out.append(f"{key}={value}")

path.write_text("\n".join(out) + "\n", encoding="utf-8")
PY
}

# Check if a port is in use
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Kill process on a specific port
kill_port() {
    local port=$1
    local pids=$(lsof -t -i :$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Install backend dependencies
install_backend_deps() {
    print_status "Installing backend dependencies..."
    cd "$BACKEND_DIR"
    if [ -f "requirements.txt" ]; then
        pip install -q -r requirements.txt 2>/dev/null || pip install flask flask-cors numpy pandas matplotlib
    else
        pip install -q flask flask-cors numpy pandas matplotlib
    fi
}

# Install frontend dependencies
install_frontend_deps() {
    print_status "Installing frontend dependencies..."
    cd "$SCRIPT_DIR"
    if [ ! -d "node_modules" ]; then
        npm install --silent 2>/dev/null || npm install
    fi
}

# Start backend server
start_backend() {
    print_status "Starting backend kernel server on port $BACKEND_PORT..."
    
    # Kill existing process if any
    if check_port $BACKEND_PORT; then
        print_warning "Port $BACKEND_PORT is in use, stopping existing process..."
        kill_port $BACKEND_PORT
    fi
    
    # Create directories
    mkdir -p "$NOTEBOOKS_DIR" "$WORKSPACE_DIR"
    
    # Start backend
    cd "$BACKEND_DIR"
    NOTEBOOKS_DIR="$NOTEBOOKS_DIR" KERNEL_WORKING_DIR="$WORKSPACE_DIR" \
        python kernel_server.py --port $BACKEND_PORT --host 0.0.0.0 > /tmp/jupyter-ish-backend.log 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    
    # Wait for backend to be ready
    local retries=30
    while [ $retries -gt 0 ]; do
        if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
            print_status "Backend kernel server is ready!"
            return 0
        fi
        sleep 0.5
        retries=$((retries - 1))
    done
    
    print_error "Backend failed to start. Check /tmp/jupyter-ish-backend.log for details."
    return 1
}

# Start frontend dev server
start_frontend() {
    print_status "Starting frontend dev server on port $FRONTEND_PORT..."
    
    # Kill existing process if any
    if check_port $FRONTEND_PORT; then
        print_warning "Port $FRONTEND_PORT is in use, stopping existing process..."
        kill_port $FRONTEND_PORT
    fi
    
    cd "$SCRIPT_DIR"
    
    # Always sync .env with backend URL (supports custom BACKEND_PORT)
    upsert_env_var "VITE_BACKEND_KERNEL_URL" "http://localhost:$BACKEND_PORT"

    # Configure collab websocket URL only when enabled
    if [ "$ENABLE_COLLAB" = "1" ]; then
        upsert_env_var "VITE_COLLAB_WS_URL" "ws://localhost:$WORKER_PORT/ws"
    fi
    
    # Start frontend
    npm run dev -- --port $FRONTEND_PORT --host 0.0.0.0 > /tmp/jupyter-ish-frontend.log 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    
    # Wait for frontend to be ready
    local retries=60
    while [ $retries -gt 0 ]; do
        if curl -s "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
            print_status "Frontend dev server is ready!"
            return 0
        fi
        sleep 0.5
        retries=$((retries - 1))
    done
    
    print_error "Frontend failed to start. Check /tmp/jupyter-ish-frontend.log for details."
    return 1
}

# Start Durable Objects websocket Worker (optional)
start_worker() {
    print_status "Starting collab Worker (Durable Objects) on port $WORKER_PORT..."

    if check_port $WORKER_PORT; then
        print_warning "Port $WORKER_PORT is in use, stopping existing process..."
        kill_port $WORKER_PORT
    fi

    cd "$SCRIPT_DIR"

    # Start worker (local mode)
    npm run worker:dev -- --local --port $WORKER_PORT > /tmp/jupyter-ish-worker.log 2>&1 &
    echo $! > "$WORKER_PID_FILE"

    local retries=30
    while [ $retries -gt 0 ]; do
        if curl -s "http://127.0.0.1:$WORKER_PORT/api/health" > /dev/null 2>&1; then
            print_status "Collab Worker is ready!"
            return 0
        fi
        sleep 0.5
        retries=$((retries - 1))
    done

    print_error "Collab Worker failed to start. Check /tmp/jupyter-ish-worker.log for details."
    return 1
}

# Build frontend for production
build_frontend() {
    print_status "Building frontend for production..."
    cd "$SCRIPT_DIR"
    npm run build
}

# Start production server
start_production() {
    print_status "Starting production server..."
    cd "$SCRIPT_DIR"
    
    # Use preview server for built files
    npm run preview -- --port $FRONTEND_PORT --host 0.0.0.0 > /tmp/jupyter-ish-frontend.log 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    
    sleep 2
    print_status "Production server is ready!"
}

# Stop all services
stop_services() {
    print_status "Stopping all services..."
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        kill $(cat "$BACKEND_PID_FILE") 2>/dev/null || true
        rm -f "$BACKEND_PID_FILE"
    fi
    kill_port $BACKEND_PORT
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        kill $(cat "$FRONTEND_PID_FILE") 2>/dev/null || true
        rm -f "$FRONTEND_PID_FILE"
    fi
    kill_port $FRONTEND_PORT

    if [ -f "$WORKER_PID_FILE" ]; then
        kill $(cat "$WORKER_PID_FILE") 2>/dev/null || true
        rm -f "$WORKER_PID_FILE"
    fi
    kill_port $WORKER_PORT
    
    print_status "All services stopped."
}

# Show status
show_status() {
    echo ""
    echo -e "${BLUE}Service Status:${NC}"
    echo "─────────────────────────────────────────"
    
    if check_port $BACKEND_PORT; then
        echo -e "Backend:  ${GREEN}● Running${NC} on port $BACKEND_PORT"
    else
        echo -e "Backend:  ${RED}○ Stopped${NC}"
    fi
    
    if check_port $FRONTEND_PORT; then
        echo -e "Frontend: ${GREEN}● Running${NC} on port $FRONTEND_PORT"
    else
        echo -e "Frontend: ${RED}○ Stopped${NC}"
    fi

    if [ "$ENABLE_COLLAB" = "1" ]; then
        if check_port $WORKER_PORT; then
            echo -e "Collab:   ${GREEN}● Running${NC} on port $WORKER_PORT"
        else
            echo -e "Collab:   ${RED}○ Stopped${NC}"
        fi
    fi
    
    echo ""
}

# Show URLs
show_urls() {
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "─────────────────────────────────────────"
    echo -e "Frontend:  ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "Backend:   ${GREEN}http://localhost:$BACKEND_PORT${NC}"
    if [ "$ENABLE_COLLAB" = "1" ]; then
        echo -e "Collab:    ${GREEN}ws://localhost:$WORKER_PORT/ws${NC}"
    fi
    echo ""
    echo -e "${YELLOW}Tip:${NC} Open the frontend URL in your browser."
    echo "     Go to Settings → Python Kernel → Enter backend URL"
    echo "     and click 'Reconnect' to use the backend kernel."
    echo ""
}

# Main deployment function
deploy() {
    local mode=${1:-dev}
    
    print_header
    
    # Install dependencies
    install_backend_deps
    install_frontend_deps
    
    # Start backend
    start_backend

    # Start collab worker (optional)
    if [ "$ENABLE_COLLAB" = "1" ]; then
        start_worker
    fi
    
    # Start frontend
    if [ "$mode" = "prod" ] || [ "$mode" = "production" ]; then
        build_frontend
        start_production
    else
        start_frontend
    fi
    
    show_status
    show_urls
}

# Help message
show_help() {
    echo "Jupyter-ish Notebook Deployment Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start, dev    Start in development mode (default)"
    echo "  prod          Build and start in production mode"
    echo "  stop          Stop all services"
    echo "  restart       Restart all services"
    echo "  status        Show service status"
    echo "  backend       Start only backend server"
    echo "  frontend      Start only frontend server"
    echo "  build         Build frontend for production"
    echo "  help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  BACKEND_PORT   Backend server port (default: 5000)"
    echo "  FRONTEND_PORT  Frontend server port (default: 5173)"
    echo "  ENABLE_COLLAB  Start collab Worker+DO (default: 0)"
    echo "  WORKER_PORT    Collab Worker port (default: 8787)"
    echo "  NOTEBOOKS_DIR  Notebooks storage directory (default: ~/notebooks)"
    echo "  WORKSPACE_DIR  Kernel working directory (default: ~/workspace)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start in dev mode"
    echo "  $0 prod               # Start in production mode"
    echo "  $0 stop               # Stop all services"
    echo "  BACKEND_PORT=8000 $0  # Use custom port"
    echo "  ENABLE_COLLAB=1 $0    # Start with local collab worker"
    echo ""
}

# Parse command
case "${1:-start}" in
    start|dev)
        deploy dev
        ;;
    prod|production)
        deploy prod
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 1
        deploy dev
        ;;
    status)
        show_status
        ;;
    backend)
        install_backend_deps
        start_backend
        show_status
        ;;
    frontend)
        install_frontend_deps
        start_frontend
        show_status
        ;;
    build)
        install_frontend_deps
        build_frontend
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
