import { useState, useEffect } from 'react';
import { X, Keyboard, Monitor, Code } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export interface NotebookSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  autoSaveInterval: number;
}

const defaultSettings: NotebookSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: true,
  lineNumbers: true,
  autoSaveInterval: 30,
};

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: NotebookSettings;
  onSettingsChange: (settings: NotebookSettings) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<NotebookSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = <K extends keyof NotebookSettings>(
    key: K,
    value: NotebookSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glassmorphism border-[var(--jupyter-border)] max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg text-foreground">
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Keyboard Shortcuts Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Keyboard Shortcuts
              </h3>
            </div>
            <div className="space-y-2 bg-secondary/30 rounded-lg p-3">
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Run cell and advance
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Shift + Enter
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Run cell without advancing
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Ctrl + Enter
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Save notebook
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Ctrl + S
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-ui text-sm text-muted-foreground">
                  Exit markdown edit mode
                </span>
                <kbd className="font-code text-xs bg-secondary px-2 py-1 rounded">
                  Escape
                </kbd>
              </div>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Editor Settings Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Editor Settings
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="fontSize" className="font-ui text-sm text-muted-foreground">
                  Font Size
                </Label>
                <select
                  id="fontSize"
                  value={localSettings.fontSize}
                  onChange={(e) => handleChange('fontSize', Number(e.target.value))}
                  className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
                >
                  {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="tabSize" className="font-ui text-sm text-muted-foreground">
                  Tab Size
                </Label>
                <select
                  id="tabSize"
                  value={localSettings.tabSize}
                  onChange={(e) => handleChange('tabSize', Number(e.target.value))}
                  className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
                >
                  {[2, 4, 8].map((size) => (
                    <option key={size} value={size}>
                      {size} spaces
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="wordWrap" className="font-ui text-sm text-muted-foreground">
                  Word Wrap
                </Label>
                <Switch
                  id="wordWrap"
                  checked={localSettings.wordWrap}
                  onCheckedChange={(checked) => handleChange('wordWrap', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="lineNumbers" className="font-ui text-sm text-muted-foreground">
                  Line Numbers
                </Label>
                <Switch
                  id="lineNumbers"
                  checked={localSettings.lineNumbers}
                  onCheckedChange={(checked) => handleChange('lineNumbers', checked)}
                />
              </div>
            </div>
          </div>

          <Separator className="bg-[var(--jupyter-border)]" />

          {/* Auto-save Settings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-[var(--jupyter-accent)]" />
              <h3 className="font-ui text-sm font-medium text-foreground">
                Auto-save
              </h3>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="autoSave" className="font-ui text-sm text-muted-foreground">
                Auto-save interval
              </Label>
              <select
                id="autoSave"
                value={localSettings.autoSaveInterval}
                onChange={(e) => handleChange('autoSaveInterval', Number(e.target.value))}
                className="font-ui text-sm bg-secondary border border-[var(--jupyter-border)] rounded px-2 py-1 text-foreground"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={0}>Disabled</option>
              </select>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { defaultSettings };
