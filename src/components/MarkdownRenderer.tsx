import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

function MarkdownRenderer({ content }: { content: string }) {
  const codeRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      const codeEl = node.querySelector("code");
      if (codeEl && !codeEl.classList.contains("hljs")) {
        try {
          hljs.highlightElement(codeEl);
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");
          if (match) {
            return (
              <div ref={codeRef} className="md-code-block">
                <div className="md-code-header">
                  <span className="md-code-lang">{match[1]}</span>
                  <button
                    className="md-code-copy"
                    onClick={() => navigator.clipboard.writeText(codeStr)}
                  >
                    📋
                  </button>
                </div>
                <pre className="md-code-pre">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          }
          return (
            <code className="md-inline-code" {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        table({ children }) {
          return (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MarkdownRenderer;
