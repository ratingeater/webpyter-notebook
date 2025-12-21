import { ChevronDown, ChevronRight, Maximize2, Copy, Check } from 'lucide-react';
import { CellOutput as CellOutputType } from '@/types/notebook';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface CellOutputProps {
  output: CellOutputType;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onExpandPlot?: () => void;
  executionCount?: number;
}

export function CellOutput({
  output,
  isCollapsed,
  onToggleCollapse,
  onExpandPlot,
  executionCount,
}: CellOutputProps) {
  const [copied, setCopied] = useState(false);
  
  // Check if output has meaningful content
  const hasContent = output.content?.trim() || 
                     output.type === 'plot' || 
                     output.type === 'error' ||
                     (output.data && Object.keys(output.data).length > 0);
  
  // Don't render anything if there's no content
  if (!hasContent) {
    return null;
  }
  
  const handleCopy = async () => {
    if (output.content) {
      await navigator.clipboard.writeText(output.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderOutput = () => {
    switch (output.type) {
      case 'text':
        return (
          <pre className="font-code text-sm text-foreground/90 whitespace-pre-wrap break-words select-text">
            {output.content}
          </pre>
        );

      case 'error':
        return (
          <div className="bg-[var(--jupyter-error)]/10 border border-[var(--jupyter-error)]/30 rounded-lg p-4">
            <pre className="font-code text-sm text-[var(--jupyter-error)] whitespace-pre-wrap break-words select-text">
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
            className="font-prose text-lg select-text"
            dangerouslySetInnerHTML={{ __html: output.content }}
          />
        );

      default:
        return <pre className="font-code text-sm select-text">{output.content}</pre>;
    }
  };

  return (
    <div className="mt-2 border border-[var(--jupyter-border)] rounded-lg bg-[var(--jupyter-surface)]/30 overflow-hidden">
      {/* Output header */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--jupyter-bg)]/50 border-b border-[var(--jupyter-border)]">
        <div className="flex items-center gap-2">
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
            {output.type === 'error' ? 'Error' : `Out [${executionCount || ''}]`}
          </span>
          {output.executionTime && (
            <span className="font-code text-xs text-muted-foreground/60">
              {(output.executionTime / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        
        {/* Copy button for text output */}
        {output.content && output.type !== 'plot' && (
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-secondary/50 rounded transition-colors"
            title="Copy output"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        )}
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
