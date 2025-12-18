import { useState } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Download,
  Settings,
  PanelLeft,
  PanelRight,
  Save,
  Plus,
  FolderOpen,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getAllNotebooks, exportNotebookAsIpynb } from '@/lib/notebook-storage';
import { Cell, NotebookMetadata } from '@/types/notebook';

interface HeaderProps {
  notebookTitle: string;
  cells: Cell[];
  onRunAll: () => void;
  onRestartKernel: () => void;
  onInterruptKernel: () => void;
  onToggleSidebar: () => void;
  onToggleVariables: () => void;
  onNewNotebook: () => void;
  onLoadNotebook: (id: string) => void;
  onSave: () => void;
  onTitleChange: (title: string) => void;
  onOpenSettings: () => void;
  isSidebarVisible: boolean;
  isVariablesVisible: boolean;
  isKernelBusy: boolean;
  isDirty: boolean;
}

export function Header({
  notebookTitle,
  cells,
  onRunAll,
  onRestartKernel,
  onInterruptKernel,
  onToggleSidebar,
  onToggleVariables,
  onNewNotebook,
  onLoadNotebook,
  onSave,
  onTitleChange,
  onOpenSettings,
  isSidebarVisible,
  isVariablesVisible,
  isKernelBusy,
  isDirty,
}: HeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(notebookTitle);
  const [notebooks, setNotebooks] = useState<NotebookMetadata[]>([]);

  const handleTitleEdit = () => {
    setEditedTitle(notebookTitle);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (editedTitle.trim()) {
      onTitleChange(editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(notebookTitle);
    setIsEditingTitle(false);
  };

  const handleOpenNotebooks = () => {
    setNotebooks(getAllNotebooks());
  };

  const handleExportIpynb = () => {
    const content = exportNotebookAsIpynb(notebookTitle, cells);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${notebookTitle.replace(/[^a-z0-9]/gi, '_')}.ipynb`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-14 glassmorphism border-b border-[var(--jupyter-border)] flex items-center justify-between px-4">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--jupyter-accent)] to-[var(--syntax-function)] flex items-center justify-center">
            <span className="font-heading text-sm font-bold text-[var(--jupyter-bg)]">J</span>
          </div>
          <span className="font-heading text-lg font-semibold text-foreground hidden sm:block">
            Jupyter-ish
          </span>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-[var(--jupyter-border)]" />

        {/* Notebook title */}
        {isEditingTitle ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') handleTitleCancel();
              }}
              className="font-ui text-sm text-foreground bg-secondary/50 px-2 py-1 rounded border border-[var(--jupyter-border)] focus:outline-none focus:border-[var(--jupyter-accent)]"
              autoFocus
            />
            <button
              onClick={handleTitleSave}
              className="p-1 hover:bg-secondary/50 rounded"
            >
              <Check className="w-4 h-4 text-[var(--jupyter-success)]" />
            </button>
            <button
              onClick={handleTitleCancel}
              className="p-1 hover:bg-secondary/50 rounded"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleTitleEdit}
            className="flex items-center gap-2 hover:bg-secondary/30 px-2 py-1 rounded transition-colors group"
          >
            <h1 className="font-ui text-sm text-foreground/80 truncate max-w-[200px]">
              {notebookTitle}
              {isDirty && <span className="text-[var(--jupyter-warning)] ml-1">•</span>}
            </h1>
            <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Center section - Actions */}
      <div className="flex items-center gap-1">
        {/* Run all */}
        <button
          onClick={onRunAll}
          disabled={isKernelBusy}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
            'hover:bg-secondary/50',
            isKernelBusy && 'opacity-50 cursor-not-allowed'
          )}
          title="Run all cells"
        >
          <Play className="w-4 h-4 text-[var(--jupyter-accent)]" />
          <span className="font-ui text-xs text-foreground hidden sm:block">Run All</span>
        </button>

        {/* Interrupt */}
        <button
          onClick={onInterruptKernel}
          disabled={!isKernelBusy}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors',
            'hover:bg-secondary/50',
            !isKernelBusy && 'opacity-50 cursor-not-allowed'
          )}
          title="Interrupt execution"
        >
          <Square className="w-4 h-4 text-[var(--jupyter-error)]" />
          <span className="font-ui text-xs text-foreground hidden sm:block">Stop</span>
        </button>

        {/* Restart */}
        <button
          onClick={onRestartKernel}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
          title="Restart kernel"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
          <span className="font-ui text-xs text-foreground hidden sm:block">Restart</span>
        </button>

        {/* Save */}
        <button
          onClick={onSave}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors',
            isDirty && 'text-[var(--jupyter-warning)]'
          )}
          title="Save notebook"
        >
          <Save className={cn('w-4 h-4', isDirty ? 'text-[var(--jupyter-warning)]' : 'text-muted-foreground')} />
          <span className="font-ui text-xs text-foreground hidden sm:block">Save</span>
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* New notebook */}
        <button
          onClick={onNewNotebook}
          className="p-2 rounded-lg hover:bg-secondary/30 transition-colors"
          title="New notebook"
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Open notebook */}
        <DropdownMenu onOpenChange={(open) => open && handleOpenNotebooks()}>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 rounded-lg hover:bg-secondary/30 transition-colors"
              title="Open notebook"
            >
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="glassmorphism border-[var(--jupyter-border)] max-h-64 overflow-y-auto"
          >
            {notebooks.length === 0 ? (
              <DropdownMenuItem disabled>
                No saved notebooks
              </DropdownMenuItem>
            ) : (
              notebooks.map((nb) => (
                <DropdownMenuItem
                  key={nb.id}
                  onClick={() => onLoadNotebook(nb.id)}
                >
                  <div className="flex flex-col">
                    <span className="font-ui text-sm">{nb.title}</span>
                    <span className="font-ui text-xs text-muted-foreground">
                      {new Date(nb.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Toggle sidebar */}
        <button
          onClick={onToggleSidebar}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isSidebarVisible ? 'bg-secondary/50' : 'hover:bg-secondary/30'
          )}
          title="Toggle sidebar"
        >
          <PanelLeft className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Toggle variables */}
        <button
          onClick={onToggleVariables}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isVariablesVisible ? 'bg-secondary/50' : 'hover:bg-secondary/30'
          )}
          title="Toggle variable inspector"
        >
          <PanelRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Export menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 rounded-lg hover:bg-secondary/30 transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="glassmorphism border-[var(--jupyter-border)]"
          >
            <DropdownMenuItem onClick={handleExportIpynb}>
              <Download className="w-4 h-4 mr-2" />
              Download as .ipynb
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-secondary/30 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
