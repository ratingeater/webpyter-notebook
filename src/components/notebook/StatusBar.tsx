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
  lastSaved: Date | null;
  isDirty: boolean;
  onRestartKernel: () => void;
  onInterruptKernel: () => void;
}

export function StatusBar({
  kernelStatus,
  lastSaved,
  isDirty,
  onRestartKernel,
  onInterruptKernel,
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
        return 'Loading Pyodide...';
      default:
        return kernelStatus;
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
            <DropdownMenuItem onClick={onRestartKernel}>
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
            <DropdownMenuItem disabled={kernelStatus !== 'disconnected'}>
              <Wifi className="w-4 h-4 mr-2" />
              Reconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Python version */}
        <span className="font-ui text-xs text-muted-foreground">Python 3.11</span>
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
