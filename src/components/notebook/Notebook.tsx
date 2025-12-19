import { useState, useRef, useEffect } from 'react';
import { useNotebook } from '@/hooks/useNotebook';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { VariableInspector } from './VariableInspector';
import { NotebookCell } from './NotebookCell';
import { AddCellButton } from './AddCellButton';
import { PlotViewer } from './PlotViewer';
import { SettingsDialog, type NotebookSettings, defaultSettings } from './SettingsDialog';
import { CellType, CellOutput } from '@/types/notebook';

export function Notebook() {
  const {
    cells,
    activeCellId,
    kernelStatus,
    variables,
    lastSaved,
    isDirty,
    notebookTitle,
    kernelLoadingMessage,
    setActiveCell,
    updateCellContent,
    addCell,
    deleteCell,
    moveCell,
    changeCellType,
    toggleOutputCollapse,
    executeCell,
    restartKernel,
    interruptKernel,
    createNotebook,
    loadNotebook,
    updateNotebookTitle,
    saveCurrentNotebook,
  } = useNotebook();

  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isVariablesVisible, setIsVariablesVisible] = useState(false);
  const [isPlotViewerOpen, setIsPlotViewerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentPlotData, setCurrentPlotData] = useState<CellOutput | null>(null);
  const [settings, setSettings] = useState<NotebookSettings>(() => {
    const saved = localStorage.getItem('jupyter-ish-settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Save settings to localStorage
  const handleSettingsChange = (newSettings: NotebookSettings) => {
    setSettings(newSettings);
    localStorage.setItem('jupyter-ish-settings', JSON.stringify(newSettings));
  };

  const scrollToCell = (cellId: string) => {
    const cellElement = cellRefs.current.get(cellId);
    if (cellElement) {
      cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setActiveCell(cellId);
  };

  const handleRunAll = async () => {
    for (const cell of cells) {
      if (cell.type === 'code') {
        await executeCell(cell.id, false);
      }
    }
  };

  const handleAddCell = (afterCellId: string | null, type: CellType) => {
    const newCellId = addCell(afterCellId, type);
    // Scroll to new cell after a brief delay
    setTimeout(() => {
      scrollToCell(newCellId);
    }, 100);
  };

  const handleExpandPlot = (output: CellOutput) => {
    setCurrentPlotData(output);
    setIsPlotViewerOpen(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentNotebook();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveCurrentNotebook]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--jupyter-bg)]">
      {/* Kernel loading indicator - non-blocking banner */}
      {kernelStatus === 'loading' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[var(--jupyter-surface)] border border-[var(--jupyter-border)] rounded-lg px-4 py-2 shadow-lg flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[var(--jupyter-accent)] border-t-transparent rounded-full animate-spin" />
          <span className="font-ui text-sm text-foreground">{kernelLoadingMessage || 'Loading Python kernel...'}</span>
        </div>
      )}

      {/* Header */}
      <Header
        notebookTitle={notebookTitle}
        cells={cells}
        onRunAll={handleRunAll}
        onRestartKernel={restartKernel}
        onInterruptKernel={interruptKernel}
        onToggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
        onToggleVariables={() => setIsVariablesVisible(!isVariablesVisible)}
        onNewNotebook={createNotebook}
        onLoadNotebook={loadNotebook}
        onSave={saveCurrentNotebook}
        onTitleChange={updateNotebookTitle}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSidebarVisible={isSidebarVisible}
        isVariablesVisible={isVariablesVisible}
        isKernelBusy={kernelStatus === 'busy'}
        isDirty={isDirty}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {isSidebarVisible && (
          <Sidebar
            cells={cells}
            activeCellId={activeCellId}
            isCollapsed={false}
            onToggle={() => setIsSidebarVisible(false)}
            onCellClick={scrollToCell}
          />
        )}

        {/* Notebook area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-[900px] mx-auto py-8 px-4">
              {/* Add cell at top */}
              <AddCellButton onAddCell={(type) => handleAddCell(null, type)} />

              {/* Cells */}
              {cells.map((cell, index) => (
                <div key={cell.id}>
                  <div
                    ref={(el) => {
                      if (el) cellRefs.current.set(cell.id, el);
                    }}
                  >
                    <NotebookCell
                      cell={cell}
                      cellId={cell.id}
                      isActive={activeCellId === cell.id}
                      index={index}
                      totalCells={cells.length}
                      onActivate={() => setActiveCell(cell.id)}
                      onUpdateContent={(content) => updateCellContent(cell.id, content)}
                      onExecute={executeCell}
                      onDelete={() => deleteCell(cell.id)}
                      onMoveUp={() => moveCell(cell.id, 'up')}
                      onMoveDown={() => moveCell(cell.id, 'down')}
                      onChangeType={(type) => changeCellType(cell.id, type)}
                      onToggleCollapse={() => toggleOutputCollapse(cell.id)}
                      onExpandPlot={() => cell.output && handleExpandPlot(cell.output)}
                      editorSettings={settings}
                    />
                  </div>

                  {/* Add cell button between cells */}
                  <AddCellButton onAddCell={(type) => handleAddCell(cell.id, type)} />
                </div>
              ))}

              {/* Bottom padding */}
              <div className="h-32" />
            </div>
        </div>

        {/* Variable Inspector */}
        <VariableInspector
          variables={variables}
          isVisible={isVariablesVisible}
          onClose={() => setIsVariablesVisible(false)}
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        kernelStatus={kernelStatus}
        lastSaved={lastSaved}
        isDirty={isDirty}
        onRestartKernel={restartKernel}
        onInterruptKernel={interruptKernel}
      />

      {/* Plot Viewer Modal */}
      <PlotViewer
        isOpen={isPlotViewerOpen}
        onClose={() => {
          setIsPlotViewerOpen(false);
          setCurrentPlotData(null);
        }}
        plotData={currentPlotData}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}
