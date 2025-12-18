import { useRef, useEffect } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

// Configure Monaco loader to avoid module loading issues
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (advance: boolean) => void;
  isActive: boolean;
  language?: string;
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  lineNumbers?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  onExecute,
  isActive,
  language = 'python',
  fontSize = 14,
  tabSize = 4,
  wordWrap = true,
  lineNumbers = true,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Define custom theme
    monaco.editor.defineTheme('jupyter-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '00d9ff', fontStyle: 'bold' },
        { token: 'string', foreground: 'f5a623' },
        { token: 'function', foreground: 'c4b5fd' },
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'number', foreground: '4ade80' },
        { token: 'operator', foreground: 'f472b6' },
        { token: 'variable', foreground: 'e2e8f0' },
        { token: 'type', foreground: '00d9ff' },
        { token: 'class', foreground: 'c4b5fd' },
        { token: 'delimiter', foreground: '94a3b8' },
      ],
      colors: {
        'editor.background': '#1a1f29',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#252d3a',
        'editor.selectionBackground': '#00d9ff33',
        'editorCursor.foreground': '#00d9ff',
        'editorLineNumber.foreground': '#4b5563',
        'editorLineNumber.activeForeground': '#9ca3af',
        'editor.inactiveSelectionBackground': '#00d9ff22',
      },
    });

    monaco.editor.setTheme('jupyter-dark');

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      onExecute(true);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onExecute(false);
    });
  };

  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.focus();
    }
  }, [isActive]);

  const lineHeight = Math.round(fontSize * 1.5);

  return (
    <div className="relative">
      <Editor
        height={Math.max(80, value.split('\n').length * lineHeight + 24)}
        language={language}
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: true,
          lineNumbers: lineNumbers ? 'on' : 'off',
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineHeight,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'line',
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'auto',
            horizontalScrollbarSize: 6,
            alwaysConsumeMouseWheel: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          automaticLayout: true,
          wordWrap: wordWrap ? 'on' : 'off',
          tabSize,
          insertSpaces: true,
          contextmenu: false,
        }}
        theme="jupyter-dark"
      />
    </div>
  );
}
