import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    let html = content;

    // Process block LaTeX ($$...$$)
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
      try {
        return `<div class="katex-display">${katex.renderToString(latex.trim(), {
          displayMode: true,
          throwOnError: false,
        })}</div>`;
      } catch {
        return `<code class="text-destructive">${latex}</code>`;
      }
    });

    // Process inline LaTeX ($...$)
    html = html.replace(/\$([^\$\n]+)\$/g, (_, latex) => {
      try {
        return katex.renderToString(latex.trim(), {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return `<code class="text-destructive">${latex}</code>`;
      }
    });

    // Process headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="font-heading text-lg font-semibold text-foreground mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="font-heading text-xl font-semibold text-foreground mt-6 mb-3">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="font-heading text-2xl font-bold text-foreground mt-6 mb-4">$1</h1>');

    // Process bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Process inline code
    html = html.replace(/`([^`]+)`/g, '<code class="font-code text-sm bg-secondary/50 px-1.5 py-0.5 rounded text-[var(--syntax-keyword)]">$1</code>');

    // Process code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="font-code text-sm bg-[#0f1419] p-4 rounded-lg overflow-x-auto my-4"><code>${code.trim()}</code></pre>`;
    });

    // Process blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-[var(--jupyter-accent)] pl-4 py-2 my-4 text-muted-foreground italic">$1</blockquote>');

    // Process unordered lists
    html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-2 space-y-1">$&</ul>');

    // Process ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

    // Process links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[var(--jupyter-accent)] hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

    // Process paragraphs (lines that aren't already wrapped)
    const lines = html.split('\n');
    html = lines
      .map((line) => {
        if (
          line.trim() &&
          !line.startsWith('<') &&
          !line.match(/^[\s]*$/)
        ) {
          return `<p class="font-prose text-base leading-relaxed text-foreground/90 my-2">${line}</p>`;
        }
        return line;
      })
      .join('\n');

    return html;
  }, [content]);

  return (
    <div
      className="prose prose-invert max-w-none px-5 py-4"
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}
