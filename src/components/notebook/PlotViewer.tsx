import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CellOutput } from '@/types/notebook';

interface PlotViewerProps {
  isOpen: boolean;
  onClose: () => void;
  plotData?: CellOutput | null;
}

export function PlotViewer({ isOpen, onClose, plotData }: PlotViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom and position when opening
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDownload = () => {
    if (plotData?.data?.['image/png']) {
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${plotData.data['image/png']}`;
      link.download = 'plot.png';
      link.click();
    }
  };

  if (!isOpen) return null;

  const hasImageData = plotData?.data?.['image/png'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-2 glassmorphism rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <ZoomOut className="w-5 h-5 text-foreground" />
            </button>
            <span className="font-ui text-sm text-foreground px-3">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 glassmorphism rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <ZoomIn className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={handleReset}
              className="p-2 glassmorphism rounded-lg hover:bg-secondary/50 transition-colors ml-2"
            >
              <RotateCcw className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {hasImageData && (
              <button 
                onClick={handleDownload}
                className="p-2 glassmorphism rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <Download className="w-5 h-5 text-foreground" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 glassmorphism rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        {/* Plot container */}
        <div
          className={cn(
            'glassmorphism rounded-xl overflow-hidden cursor-grab',
            isDragging && 'cursor-grabbing'
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="p-8 flex items-center justify-center min-h-[400px]"
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transformOrigin: 'center',
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
          >
            {hasImageData ? (
              <div className="bg-white rounded-lg p-6">
                <img
                  src={`data:image/png;base64,${plotData.data!['image/png']}`}
                  alt="Plot"
                  className="max-w-full h-auto"
                />
              </div>
            ) : (
              <div className="text-muted-foreground font-ui">
                No plot data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
