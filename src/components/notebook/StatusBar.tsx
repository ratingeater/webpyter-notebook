import { useState } from 'react';
import {
  Circle,
  RefreshCw,
  Square,
  Wifi,
  WifiOff,
  Clock,
  HardDrive,
  ChevronUp,
  Users,
} from 'lucide-react';
import { KernelStatus } from '@/types/notebook';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  kernelStatus: KernelStatus;
  kernelKind?: 'backend' | 'pyodide' | null;
  collabStatus?: 'disabled' | 'connecting' | 'connected' | 'fallback';
  collabPeerCount?: number;
  lastSaved: Date | null;
  isDirty: boolean;
  onRestartKernel: () => void;
  onInterruptKernel: () => void;
  onReconnectKernel?: () => void;
}

export function StatusBar({
  kernelStatus,
  kernelKind,
  collabStatus = 'disabled',
  collabPeerCount = 1,
  lastSaved,
  isDirty,
  onRestartKernel,
  onInterruptKernel,
  onReconnectKernel,
}: StatusBarProps) {
  const [memoryUsage] = useState('128 MB');

  const getStatusColor = () => {
    switch (kernelStatus) {
      case 'idle':
        return 'text-[var(--jupyter-success)]';
      case 'busy':
        return 'text-[var(--jupyter-accent)]';
      case 'disconnected':
        return 'text-[var(--jupyter-error)]';
      case 'starting':
      case 'loading':
        return 'text-[var(--jupyter-warning)]';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = () => {
    switch (kernelStatus) {
      case 'idle':
        return <Circle className="w-3 h-3 fill-current" />;
      case 'busy':
        return <Circle className="w-3 h-3 fill-current animate-pulse" />;
      case 'disconnected':
        return <WifiOff className="w-3 h-3" />;
      case 'starting':
      case 'loading':
        return <RefreshCw className="w-3 h-3 animate-spin" />;
      default:
        return <Circle className="w-3 h-3" />;
    }
  };

  const getStatusText = () => {
    switch (kernelStatus) {
      case 'loading':
        return kernelKind === 'backend' ? 'Connecting...' : 'Loading Pyodide...';
      case 'busy':
        return 'Running';
      case 'idle':
        return kernelKind === 'backend' ? 'Backend Ready' : 'Pyodide Ready';
      case 'disconnected':
        return 'Disconnected';
      default:
        return kernelStatus;
    }
  };

  const getKernelBadge = () => {
    if (!kernelKind) return null;
    if (kernelKind === 'backend') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">
          BACKEND
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        PYODIDE
      </span>
    );
  };

  const getCollabColor = () => {
    switch (collabStatus) {
      case 'connected':
        return 'text-[var(--jupyter-success)]';
      case 'connecting':
        return 'text-[var(--jupyter-warning)]';
      case 'fallback':
        return 'text-[var(--jupyter-warning)]';
      case 'disabled':
      default:
        return 'text-muted-foreground';
    }
  };

  const getCollabText = () => {
    switch (collabStatus) {
      case 'connected':
        return `Collab ${Math.max(1, collabPeerCount)}`;
      case 'connecting':
        return 'Collab Connecting…';
      case 'fallback':
        return 'Collab Offline';
      case 'disabled':
      default:
        return 'Collab Off';
    }
  };

  const formatLastSaved = () => {
    if (!lastSaved) return 'Not saved';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);
    if (diff < 60) return 'Just saved';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastSaved.toLocaleTimeString();
  };

  return (
    <div className="h-8 glassmorphism border-t border-[var(--jupyter-border)] flex items-center justify-between px-4">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Kernel status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-secondary/30 px-2 py-1 rounded transition-colors">
              <span className={cn('flex items-center gap-1.5', getStatusColor())}>
                {getStatusIcon()}
                <span className="font-ui text-xs capitalize">{getStatusText()}</span>
              </span>
              <ChevronUp className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="top"
            className="glassmorphism border-[var(--jupyter-border)]"
          >
            <DropdownMenuItem onClick={onRestartKernel} disabled={!kernelKind}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Restart Kernel
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onInterruptKernel}
              disabled={kernelStatus !== 'busy'}
            >
              <Square className="w-4 h-4 mr-2" />
              Interrupt Execution
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onReconnectKernel}
              disabled={kernelStatus === 'loading'}
            >
              <Wifi className="w-4 h-4 mr-2" />
              Reconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Kernel type badge */}
        {getKernelBadge()}

        {/* Collab status */}
        <div className={cn('flex items-center gap-1.5', getCollabColor())}>
          <Users className={cn('w-3 h-3', collabStatus === 'connecting' && 'animate-pulse')} />
          <span className="font-ui text-xs">{getCollabText()}</span>
        </div>

        {/* Python version */}
        <span className="font-ui text-xs text-muted-foreground">
          {kernelKind === 'backend' ? 'Python 3.x' : 'Python 3.11 (WASM)'}
        </span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Memory usage */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <HardDrive className="w-3 h-3" />
          <span className="font-ui text-xs">{memoryUsage}</span>
        </div>

        {/* Last saved */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className={cn('font-ui text-xs', isDirty && 'text-[var(--jupyter-warning)]')}>
            {isDirty ? 'Unsaved changes' : formatLastSaved()}
          </span>
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--jupyter-warning)] animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
