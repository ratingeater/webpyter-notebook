import { Plus, Code, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CellType } from '@/types/notebook';

interface AddCellButtonProps {
  onAddCell: (type: CellType) => void;
}

export function AddCellButton({ onAddCell }: AddCellButtonProps) {
  return (
    <div className="cell-gap h-8 flex items-center justify-center relative">
      <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--jupyter-border)] opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="add-cell-button z-10 flex items-center gap-1.5 px-3 py-1.5 glassmorphism rounded-full hover:bg-secondary/50 transition-all">
            <Plus className="w-4 h-4 text-[var(--jupyter-accent)]" />
            <span className="font-ui text-xs text-muted-foreground">Add cell</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="glassmorphism border-[var(--jupyter-border)]">
          <DropdownMenuItem onClick={() => onAddCell('code')}>
            <Code className="w-4 h-4 mr-2 text-[var(--jupyter-accent)]" />
            Code cell
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddCell('markdown')}>
            <FileText className="w-4 h-4 mr-2 text-[var(--syntax-function)]" />
            Markdown cell
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
