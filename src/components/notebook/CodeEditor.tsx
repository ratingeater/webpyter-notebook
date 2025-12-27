import { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { MonacoBinding } from "y-monaco";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

// Configure Monaco loader to avoid module loading issues
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs',
  },
  'vs/nls': {
    availableLanguages: {},
  },
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (advance: boolean) => void;
  onFocus?: () => void;
  isActive: boolean;
  language?: string;
  fontSize?: number;
  tabSize?: number;
  wordWrap?: boolean;
  lineNumbers?: boolean;
  yText?: Y.Text;
  awareness?: Awareness;
}

export function CodeEditor({
  value,
  onChange,
  onExecute,
  onFocus,
  isActive,
  language = 'python',
  fontSize = 14,
  tabSize = 4,
  wordWrap = true,
  lineNumbers = true,
  yText,
  awareness,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const contentSizeListenerRef = useRef<{ dispose: () => void } | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const isCollab = Boolean(yText && awareness);
  // Use ref to always have the latest onExecute callback
  const onExecuteRef = useRef(onExecute);
  const onFocusRef = useRef(onFocus);
  
  // Keep the refs updated with the latest callbacks
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);
  
  useEffect(() => {
    onFocusRef.current = onFocus;
  }, [onFocus]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    setEditorReady(true);

    // Auto-resize based on content (works for both collab + non-collab mode)
    contentSizeListenerRef.current?.dispose();
    const updateHeight = () => {
      const height = editor.getContentHeight();
      setMeasuredHeight(Math.max(80, height));
    };
    updateHeight();
    contentSizeListenerRef.current = editor.onDidContentSizeChange(updateHeight);

    // Define custom theme (only needs to be done once globally, but harmless to repeat)
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

    // Add keyboard shortcuts using keybinding with context
    // Using addAction instead of addCommand for better control
    editor.addAction({
      id: 'execute-cell-advance',
      label: 'Execute Cell and Advance',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => {
        // This action is bound to THIS specific editor instance
        onExecuteRef.current(true);
      },
    });

    editor.addAction({
      id: 'execute-cell-stay',
      label: 'Execute Cell',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        // This action is bound to THIS specific editor instance
        onExecuteRef.current(false);
      },
    });
    
    // Listen for focus events to activate the cell
    editor.onDidFocusEditorWidget(() => {
      if (onFocusRef.current) {
        onFocusRef.current();
      }
    });
  };

  useEffect(() => {
    return () => {
      contentSizeListenerRef.current?.dispose();
      contentSizeListenerRef.current = null;
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editorReady || !editor) return;

    if (!yText || !awareness) {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      return;
    }

    const model = editor.getModel();
    if (!model) return;

    bindingRef.current?.destroy();
    bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), awareness);

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [yText, awareness, editorReady]);

  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.focus();
    }
  }, [isActive]);

  const lineHeight = Math.round(fontSize * 1.5);
  const fallbackHeight = Math.max(80, value.split('\n').length * lineHeight + 24);
  const height = measuredHeight ?? fallbackHeight;

  return (
    <div className="relative">
      <Editor
        height={height}
        language={language}
        value={isCollab ? undefined : value}
        defaultValue={isCollab ? value : undefined}
        onChange={isCollab ? undefined : (val) => onChange(val || '')}
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
