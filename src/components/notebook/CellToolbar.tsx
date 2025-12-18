import {
  Play,
  Trash2,
  ChevronUp,
  ChevronDown,
  Code,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { CellType } from '@/types/notebook';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface CellToolbarProps {
  cellType: CellType;
  onRun: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeType: (type: CellType) => void;
  isRunning: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function CellToolbar({
  cellType,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
  onChangeType,
  isRunning,
  canMoveUp,
  canMoveDown,
}: CellToolbarProps) {
  return (
    <div className="absolute -top-10 right-2 flex items-center gap-1 glassmorphism rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      {/* Run button */}
      <button
        onClick={onRun}
        disabled={isRunning}
        className={cn(
          'toolbar-button p-1.5 rounded-md hover:bg-secondary/50 transition-colors',
          isRunning && 'opacity-50 cursor-not-allowed'
        )}
        title="Run cell (Shift+Enter)"
      >
        <Play
          className={cn(
            'w-4 h-4',
            isRunning ? 'text-[var(--jupyter-accent)] animate-pulse' : 'text-muted-foreground'
          )}
        />
      </button>

      {/* Cell type selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="toolbar-button p-1.5 rounded-md hover:bg-secondary/50 transition-colors flex items-center gap-1"
            title="Cell type"
          >
            {cellType === 'code' ? (
              <Code className="w-4 h-4 text-muted-foreground" />
            ) : (
              <FileText className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glassmorphism border-[var(--jupyter-border)]">
          <DropdownMenuItem
            onClick={() => onChangeType('code')}
            className={cn(cellType === 'code' && 'bg-secondary/50')}
          >
            <Code className="w-4 h-4 mr-2" />
            Code
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onChangeType('markdown')}
            className={cn(cellType === 'markdown' && 'bg-secondary/50')}
          >
            <FileText className="w-4 h-4 mr-2" />
            Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move up */}
      <button
        onClick={onMoveUp}
        disabled={!canMoveUp}
        className={cn(
          'toolbar-button p-1.5 rounded-md hover:bg-secondary/50 transition-colors',
          !canMoveUp && 'opacity-30 cursor-not-allowed'
        )}
        title="Move up"
      >
        <ChevronUp className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Move down */}
      <button
        onClick={onMoveDown}
        disabled={!canMoveDown}
        className={cn(
          'toolbar-button p-1.5 rounded-md hover:bg-secondary/50 transition-colors',
          !canMoveDown && 'opacity-30 cursor-not-allowed'
        )}
        title="Move down"
      >
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* More options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="toolbar-button p-1.5 rounded-md hover:bg-secondary/50 transition-colors"
            title="More options"
          >
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glassmorphism border-[var(--jupyter-border)]">
          <DropdownMenuItem onClick={onRun}>
            <Play className="w-4 h-4 mr-2" />
            Run cell
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-[var(--jupyter-error)] focus:text-[var(--jupyter-error)]"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete cell
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
