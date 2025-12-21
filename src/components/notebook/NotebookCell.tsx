import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Cell, CellType } from '@/types/notebook';
import { CodeEditor } from './CodeEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CellOutput } from './CellOutput';
import { CellToolbar } from './CellToolbar';
import { cn } from '@/lib/utils';

interface NotebookCellProps {
  cell: Cell;
  cellId: string;
  isActive: boolean;
  index: number;
  totalCells: number;
  onActivate: () => void;
  onUpdateContent: (content: string) => void;
  onExecute: (cellId: string, advance: boolean) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeType: (type: CellType) => void;
  onToggleCollapse: () => void;
  onExpandPlot?: () => void;
  editorSettings?: {
    fontSize?: number;
    tabSize?: number;
    wordWrap?: boolean;
    lineNumbers?: boolean;
  };
}

export function NotebookCell({
  cell,
  cellId,
  isActive,
  index,
  totalCells,
  onActivate,
  onUpdateContent,
  onExecute,
  onDelete,
  onMoveUp,
  onMoveDown,
  onChangeType,
  onToggleCollapse,
  onExpandPlot,
  editorSettings,
}: NotebookCellProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleClick = () => {
    onActivate();
    if (cell.type === 'markdown') {
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    if (cell.type === 'markdown') {
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        'cell-container group relative animate-fade-slide-in',
        isActive && 'active',
        cell.status === 'running' && 'running',
        cell.status === 'error' && 'error'
      )}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <div className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-muted-foreground/50" />
      </div>

      {/* Execution count */}
      <div className="absolute left-10 top-3 font-code text-xs text-muted-foreground/60 w-8 text-right">
        {cell.type === 'code' && (
          <>
            [{cell.executionCount ?? ' '}]
          </>
        )}
      </div>

      {/* Cell toolbar */}
      <CellToolbar
        cellType={cell.type}
        onRun={() => onExecute(cellId, true)}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onChangeType={onChangeType}
        isRunning={cell.status === 'running'}
        canMoveUp={index > 0}
        canMoveDown={index < totalCells - 1}
      />

      {/* Cell content */}
      <div className="ml-16 mr-4">
        {cell.type === 'code' ? (
          <CodeEditor
            value={cell.content}
            onChange={onUpdateContent}
            onExecute={(advance) => onExecute(cellId, advance)}
            onFocus={onActivate}
            isActive={isActive}
            fontSize={editorSettings?.fontSize}
            tabSize={editorSettings?.tabSize}
            wordWrap={editorSettings?.wordWrap}
            lineNumbers={editorSettings?.lineNumbers}
          />
        ) : isEditing || !cell.content ? (
          <div onBlur={handleBlur}>
            <textarea
              value={cell.content}
              onChange={(e) => onUpdateContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  setIsEditing(false);
                  onExecute(cellId, true);
                }
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  setIsEditing(false);
                  onExecute(cellId, false);
                }
                if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
              className="w-full min-h-[100px] bg-transparent font-code text-sm text-foreground resize-none focus:outline-none p-4"
              placeholder="Enter markdown content..."
              autoFocus
            />
          </div>
        ) : (
          <div onDoubleClick={() => setIsEditing(true)}>
            <MarkdownRenderer content={cell.content} />
          </div>
        )}
      </div>

      {/* Cell output */}
      {cell.output && (
        <div className="ml-16 mr-4 mb-2">
          <CellOutput
            output={cell.output}
            isCollapsed={cell.isCollapsed ?? false}
            onToggleCollapse={onToggleCollapse}
            onExpandPlot={onExpandPlot}
            executionCount={cell.executionCount}
          />
        </div>
      )}
    </div>
  );
}
