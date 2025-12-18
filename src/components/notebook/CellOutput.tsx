import { ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
import { CellOutput as CellOutputType } from '@/types/notebook';
import { cn } from '@/lib/utils';

interface CellOutputProps {
  output: CellOutputType;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onExpandPlot?: () => void;
}

export function CellOutput({
  output,
  isCollapsed,
  onToggleCollapse,
  onExpandPlot,
}: CellOutputProps) {
  const renderOutput = () => {
    switch (output.type) {
      case 'text':
        return (
          <pre className="font-code text-sm text-foreground/90 whitespace-pre-wrap">
            {output.content}
          </pre>
        );

      case 'error':
        return (
          <div className="bg-[var(--jupyter-error)]/10 border border-[var(--jupyter-error)]/30 rounded-lg p-4">
            <pre className="font-code text-sm text-[var(--jupyter-error)] whitespace-pre-wrap">
              {output.content}
            </pre>
          </div>
        );

      case 'plot':
        // Check if we have actual image data
        if (output.data?.['image/png']) {
          return (
            <div className="relative group">
              <div className="bg-white rounded-lg p-4 inline-block">
                <img
                  src={`data:image/png;base64,${output.data['image/png']}`}
                  alt="Plot output"
                  className="max-w-full h-auto transition-opacity duration-300"
                />
              </div>
              
              {/* Expand button */}
              <button
                onClick={onExpandPlot}
                className="absolute top-2 right-2 p-2 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>
            </div>
          );
        }
        
        // Fallback for legacy plot type without data
        return (
          <div className="relative group">
            <div className="bg-white rounded-lg p-4 inline-block">
              <div className="text-gray-500 text-sm">Plot rendering...</div>
            </div>
          </div>
        );

      case 'table':
        return (
          <div className="overflow-x-auto">
            <table className="font-code text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-muted-foreground">Index</th>
                  <th className="px-4 py-2 text-left text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-2 text-muted-foreground">{i}</td>
                    <td className="px-4 py-2">{Math.random().toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'latex':
        return (
          <div
            className="font-prose text-lg"
            dangerouslySetInnerHTML={{ __html: output.content }}
          />
        );

      default:
        return <pre className="font-code text-sm">{output.content}</pre>;
    }
  };

  return (
    <div className="border-t border-[var(--jupyter-border)]">
      {/* Output header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--jupyter-bg)]/50">
        <button
          onClick={onToggleCollapse}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <span className="font-code text-xs text-muted-foreground">
          Out [{output.executionTime ? `${(output.executionTime / 1000).toFixed(2)}s` : ''}]
        </span>
      </div>

      {/* Output content */}
      <div
        className={cn(
          'px-4 py-3 output-container overflow-x-auto',
          isCollapsed && 'hidden'
        )}
      >
        {renderOutput()}
      </div>
    </div>
  );
}
