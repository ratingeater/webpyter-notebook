import { X, ChevronRight, ChevronDown } from 'lucide-react';
import { Variable } from '@/types/notebook';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface VariableInspectorProps {
  variables: Variable[];
  isVisible: boolean;
  onClose: () => void;
}

export function VariableInspector({
  variables,
  isVisible,
  onClose,
}: VariableInspectorProps) {
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set());

  const toggleExpand = (name: string) => {
    setExpandedVars((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (!isVisible) return null;

  return (
    <div className="w-72 h-full glassmorphism border-l border-[var(--jupyter-border)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--jupyter-border)]">
        <span className="font-ui text-sm font-medium text-foreground">Variables</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-secondary/50 rounded-md transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Variable list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {variables.length === 0 ? (
            <p className="font-ui text-xs text-muted-foreground text-center py-8">
              No variables defined
            </p>
          ) : (
            <div className="space-y-1">
              {variables.map((variable) => (
                <div
                  key={variable.name}
                  className="rounded-md border border-[var(--jupyter-border)] overflow-hidden"
                >
                  <button
                    onClick={() => toggleExpand(variable.name)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors"
                  >
                    {expandedVars.has(variable.name) ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span className="font-code text-sm text-[var(--syntax-function)]">
                      {variable.name}
                    </span>
                    <span className="font-code text-xs text-muted-foreground ml-auto">
                      {variable.type}
                    </span>
                  </button>

                  {expandedVars.has(variable.name) && (
                    <div className="px-3 py-2 bg-[var(--jupyter-bg)]/50 border-t border-[var(--jupyter-border)]">
                      <div className="font-code text-xs text-foreground/80 break-all">
                        {variable.value}
                      </div>
                      {variable.size && (
                        <div className="font-ui text-xs text-muted-foreground mt-1">
                          Size: {variable.size}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--jupyter-border)]">
        <p className="font-ui text-xs text-muted-foreground">
          {variables.length} variable{variables.length !== 1 ? 's' : ''} in workspace
        </p>
      </div>
    </div>
  );
}
