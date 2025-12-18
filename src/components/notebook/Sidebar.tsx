import { ChevronLeft, ChevronRight, Code, FileText, Hash } from 'lucide-react';
import { Cell } from '@/types/notebook';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  cells: Cell[];
  activeCellId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
  onCellClick: (cellId: string) => void;
}

export function Sidebar({
  cells,
  activeCellId,
  isCollapsed,
  onToggle,
  onCellClick,
}: SidebarProps) {
  const getCellTitle = (cell: Cell, index: number): string => {
    if (cell.type === 'markdown') {
      // Extract first heading or first line
      const headingMatch = cell.content.match(/^#+ (.+)$/m);
      if (headingMatch) return headingMatch[1];
      const firstLine = cell.content.split('\n')[0];
      return firstLine.slice(0, 30) + (firstLine.length > 30 ? '...' : '');
    }
    return `Cell ${index + 1}`;
  };

  const getHeadingLevel = (cell: Cell): number => {
    if (cell.type !== 'markdown') return 0;
    const match = cell.content.match(/^(#+) /m);
    return match ? match[1].length : 0;
  };

  return (
    <div
      className={cn(
        'h-full glassmorphism border-r border-[var(--jupyter-border)] transition-all duration-300 flex flex-col',
        isCollapsed ? 'w-12' : 'w-60'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--jupyter-border)]">
        {!isCollapsed && (
          <span className="font-ui text-sm font-medium text-foreground">Navigator</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 hover:bg-secondary/50 rounded-md transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Cell list */}
      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {cells.map((cell, index) => {
              const headingLevel = getHeadingLevel(cell);
              const title = getCellTitle(cell, index);

              return (
                <button
                  key={cell.id}
                  onClick={() => onCellClick(cell.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                    'hover:bg-secondary/50',
                    activeCellId === cell.id && 'bg-secondary/70 text-[var(--jupyter-accent)]'
                  )}
                  style={{
                    paddingLeft: headingLevel > 0 ? `${(headingLevel - 1) * 12 + 8}px` : '8px',
                  }}
                >
                  {cell.type === 'code' ? (
                    <Code className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  ) : headingLevel > 0 ? (
                    <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span
                    className={cn(
                      'font-ui text-xs truncate',
                      headingLevel === 1 && 'font-semibold',
                      headingLevel === 2 && 'font-medium'
                    )}
                  >
                    {title}
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Collapsed icons */}
      {isCollapsed && (
        <div className="flex-1 p-2 space-y-2">
          {cells.slice(0, 10).map((cell) => (
            <button
              key={cell.id}
              onClick={() => onCellClick(cell.id)}
              className={cn(
                'w-full flex items-center justify-center p-1.5 rounded-md transition-colors',
                'hover:bg-secondary/50',
                activeCellId === cell.id && 'bg-secondary/70'
              )}
            >
              {cell.type === 'code' ? (
                <Code
                  className={cn(
                    'w-4 h-4',
                    activeCellId === cell.id
                      ? 'text-[var(--jupyter-accent)]'
                      : 'text-muted-foreground'
                  )}
                />
              ) : (
                <FileText
                  className={cn(
                    'w-4 h-4',
                    activeCellId === cell.id
                      ? 'text-[var(--jupyter-accent)]'
                      : 'text-muted-foreground'
                  )}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
