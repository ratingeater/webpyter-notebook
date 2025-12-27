import { useState, useEffect } from 'react';
import { Keyboard, Monitor, Code, Server, RefreshCw, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export type KernelMode = 'backend' | 'pyodide';

export interface NotebookSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  autoSaveInterval: number;
  backendKernelUrl: string;
  kernelMode: KernelMode; // Strict mode selection: 'backend' or 'pyodide'
  collabEnabled: boolean;
  collabServerUrl: string;
  collabToken: string;
  collabConnectTimeoutMs: number;
}

function isLocalHostname(hostname: string): boolean {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}

function shouldIgnoreEnvBackendUrl(envUrl: string): boolean {
  if (!envUrl) return false;
  try {
    const parsed = new URL(envUrl);
    if (!isLocalHostname(parsed.hostname)) return false;
    const runtimeHost = typeof window !== 'undefined' ? window.location.hostname : '';
    return !isLocalHostname(runtimeHost);
  } catch {
    return false;
  }
}

const rawEnvBackendKernelUrl = (import.meta.env.VITE_BACKEND_KERNEL_URL ?? '').trim().replace(/\/$/, '');
const envBackendKernelUrl = shouldIgnoreEnvBackendUrl(rawEnvBackendKernelUrl) ? '' : rawEnvBackendKernelUrl;
const envDefaultKernelMode = import.meta.env.VITE_DEFAULT_KERNEL_MODE;
const inferredKernelMode: KernelMode =
  envDefaultKernelMode === 'backend' || envDefaultKernelMode === 'pyodide'
    ? envDefaultKernelMode
    : envBackendKernelUrl
      ? 'backend'
      : 'pyodide';

const envCollabWsUrl = (import.meta.env.VITE_COLLAB_WS_URL ?? '').trim();
const envCollabToken = (import.meta.env.VITE_COLLAB_TOKEN ?? '').trim();
const envCollabTimeoutRaw = (import.meta.env.VITE_COLLAB_CONNECT_TIMEOUT_MS ?? '').trim();
const envCollabTimeout = envCollabTimeoutRaw ? Number(envCollabTimeoutRaw) : NaN;
const envCollabConnectTimeoutMs = Number.isFinite(envCollabTimeout) ? Math.max(0, Math.floor(envCollabTimeout)) : 2000;

const defaultSettings: NotebookSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: true,
  lineNumbers: true,
  autoSaveInterval: 30,
  backendKernelUrl: envBackendKernelUrl, // Default from env (optional)
  kernelMode: inferredKernelMode,
  collabEnabled: !!envCollabWsUrl,
  collabServerUrl: envCollabWsUrl,
  collabToken: envCollabToken,
  collabConnectTimeoutMs: envCollabConnectTimeoutMs,
};

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: NotebookSettings;
  onSettingsChange: (settings: NotebookSettings) => void;
  kernelKind?: 'backend' | 'pyodide' | null;
  onReconnectKernel?: () => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  kernelKind,
  onReconnectKernel,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<NotebookSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = <K extends keyof NotebookSettings>(
    key: K,
    value: NotebookSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glassmorphism border-[var(--jupyter-border)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-foreground">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-visible">
          {/* Keyboard Shortcuts Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Keyboard Shortcuts
              </h3>
            </div>
            <div className="space-y-2 bg-secondary/30 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Run cell and advance
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Shift + Enter
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Run cell without advancing
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Ctrl + Enter
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Save notebook
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Ctrl + S
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Exit markdown edit mode
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Escape
                </kbd>
              </div>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Editor Settings Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Editor Settings
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="fontSize" className="font-ui text-sm text-muted-foreground">
                  Font Size
                </Label>
                <select
                  id="fontSize"
                  value={localSettings.fontSize}
                  onChange={(e) => handleChange('fontSize', Number(e.target.value))}
                  className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
                >
                  {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="tabSize" className="font-ui text-sm text-muted-foreground">
                  Tab Size
                </Label>
                <select
                  id="tabSize"
                  value={localSettings.tabSize}
                  onChange={(e) => handleChange('tabSize', Number(e.target.value))}
                  className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
                >
                  {[2, 4, 8].map((size) => (
                    <option key={size} value={size}>
                      {size} spaces
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="wordWrap" className="font-ui text-sm text-muted-foreground">
                  Word Wrap
                </Label>
                <Switch
                  id="wordWrap"
                  checked={localSettings.wordWrap}
                  onCheckedChange={(checked) => handleChange('wordWrap', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="lineNumbers" className="font-ui text-sm text-muted-foreground">
                  Line Numbers
                </Label>
                <Switch
                  id="lineNumbers"
                  checked={localSettings.lineNumbers}
                  onCheckedChange={(checked) => handleChange('lineNumbers', checked)}
                />
              </div>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Auto-save Settings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Auto-save
              </h3>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="autoSave" className="font-ui text-sm text-muted-foreground">
                Auto-save interval
              </Label>
              <select
                id="autoSave"
                value={localSettings.autoSaveInterval}
                onChange={(e) => handleChange('autoSaveInterval', Number(e.target.value))}
                className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={0}>Disabled</option>
              </select>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Python Kernel Settings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Python Kernel
              </h3>
            </div>
            <div className="space-y-4">
              {/* Kernel Mode Selection */}
              <div className="space-y-2">
                <Label className="font-ui text-sm text-muted-foreground">
                  Kernel Mode
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleChange('kernelMode', 'backend')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      localSettings.kernelMode === 'backend'
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-[var(--jupyter-border)] bg-secondary/30 hover:bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${
                        localSettings.kernelMode === 'backend' ? 'bg-green-500' : 'bg-muted-foreground/30'
                      }`} />
                      <span className="font-ui text-sm font-medium text-foreground">Backend</span>
                    </div>
                    <p className="font-ui text-xs text-muted-foreground">
                      Full Python with pip install support
                    </p>
                  </button>
                  <button
                    onClick={() => handleChange('kernelMode', 'pyodide')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      localSettings.kernelMode === 'pyodide'
                        ? 'border-yellow-500 bg-yellow-500/10'
                        : 'border-[var(--jupyter-border)] bg-secondary/30 hover:bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${
                        localSettings.kernelMode === 'pyodide' ? 'bg-yellow-500' : 'bg-muted-foreground/30'
                      }`} />
                      <span className="font-ui text-sm font-medium text-foreground">Pyodide</span>
                    </div>
                    <p className="font-ui text-xs text-muted-foreground">
                      Browser-based (limited packages)
                    </p>
                  </button>
                </div>
              </div>
              
              {/* Backend URL (only show when backend mode is selected) */}
              {localSettings.kernelMode === 'backend' && (
                <div className="space-y-2">
                  <Label htmlFor="backendUrl" className="font-ui text-sm text-muted-foreground">
                    Backend Kernel URL
                  </Label>
                  <input
                    id="backendUrl"
                    type="text"
                    value={localSettings.backendKernelUrl}
                    onChange={(e) => handleChange('backendKernelUrl', e.target.value)}
                    placeholder="e.g., http://localhost:5000"
                    className="w-full font-code text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50"
                  />
                  <p className="font-ui text-xs text-muted-foreground">
                    URL of your Python kernel server (e.g. <span className="font-code">https://your-backend.com</span>).
                    Do not use the collaboration Worker URL (<span className="font-code">/ws</span>).
                  </p>
                </div>
              )}

              {/* Current Status */}
              <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-ui text-sm text-muted-foreground">Status: </span>
                    <span className={`font-ui text-sm font-medium ${
                      kernelKind === 'backend' ? 'text-green-400' : 
                      kernelKind === 'pyodide' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {kernelKind === 'backend' ? 'Connected to Backend' : 
                       kernelKind === 'pyodide' ? 'Using Pyodide (Browser)' : 'Disconnected'}
                    </span>
                  </div>
                  {onReconnectKernel && (
                    <button
                      onClick={onReconnectKernel}
                      className="flex items-center gap-1.5 px-2 py-1 bg-[var(--jupyter-accent)]/20 hover:bg-[var(--jupyter-accent)]/30 text-[var(--jupyter-accent)] rounded text-xs font-ui transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reconnect
                    </button>
                  )}
                </div>
                {kernelKind === 'backend' && (
                  <p className="font-ui text-xs text-green-400/80">
                    ✓ Full Python environment with pip install support
                  </p>
                )}
                {kernelKind === 'pyodide' && (
                  <p className="font-ui text-xs text-yellow-400/80">
                    ⚠ Limited to pre-bundled packages (numpy, pandas, matplotlib)
                  </p>
                )}
                {!kernelKind && (
                  <p className="font-ui text-xs text-red-400/80">
                    ✗ Click Reconnect to connect to kernel
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Collaboration Settings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Collaboration (Yjs)
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="collabEnabled" className="font-ui text-sm text-muted-foreground">
                  Enable collaboration
                </Label>
                <Switch
                  id="collabEnabled"
                  checked={localSettings.collabEnabled}
                  onCheckedChange={(checked) => handleChange('collabEnabled', checked)}
                />
              </div>

              {localSettings.collabEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="collabServerUrl" className="font-ui text-sm text-muted-foreground">
                      Collab WebSocket URL
                    </Label>
                    <input
                      id="collabServerUrl"
                      type="text"
                      value={localSettings.collabServerUrl}
                      onChange={(e) => handleChange('collabServerUrl', e.target.value)}
                      placeholder="e.g., wss://<your-worker-domain>/ws"
                      className="w-full font-code text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50"
                    />
                    <p className="font-ui text-xs text-muted-foreground">
                      This is the Cloudflare Worker endpoint used for real-time sync (not code execution).
                      Example: <span className="font-code">wss://your-worker.workers.dev/ws</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="collabToken" className="font-ui text-sm text-muted-foreground">
                      Collab token (optional)
                    </Label>
                    <input
                      id="collabToken"
                      type="password"
                      value={localSettings.collabToken}
                      onChange={(e) => handleChange('collabToken', e.target.value)}
                      placeholder="token"
                      className="w-full font-code text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-3 py-2 text-foreground placeholder:text-muted-foreground/50"
                    />
                    <p className="font-ui text-xs text-muted-foreground">
                      Sent as <span className="font-code">?token=...</span> when connecting. Avoid embedding secrets in a public frontend.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="collabTimeout" className="font-ui text-sm text-muted-foreground">
                      Connect timeout
                    </Label>
                    <select
                      id="collabTimeout"
                      value={localSettings.collabConnectTimeoutMs}
                      onChange={(e) => handleChange('collabConnectTimeoutMs', Number(e.target.value))}
                      className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
                    >
                      <option value={500}>0.5s</option>
                      <option value={1000}>1s</option>
                      <option value={2000}>2s</option>
                      <option value={5000}>5s</option>
                      <option value={10000}>10s</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { defaultSettings };
