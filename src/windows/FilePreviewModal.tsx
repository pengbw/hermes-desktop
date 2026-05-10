import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FilePreviewModalProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

function getFileType(fileName: string): "markdown" | "html" | "pdf" | "word" | "code" | "unknown" {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "word";
  if ([
    "js", "jsx", "ts", "tsx", "py", "rs", "go", "java", "c", "cpp", "h",
    "css", "scss", "less", "json", "yaml", "yml", "toml", "xml", "sql",
    "sh", "bash", "zsh", "rb", "php", "swift", "kt", "dart", "lua",
  ].includes(ext)) return "code";
  return "unknown";
}

function getLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
    h: "c", css: "css", scss: "scss", less: "less", json: "json",
    yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", sql: "sql",
    sh: "bash", bash: "bash", zsh: "bash", rb: "ruby", php: "php",
    swift: "swift", kt: "kotlin", dart: "dart", lua: "lua",
    html: "html", htm: "html", md: "markdown", markdown: "markdown",
  };
  return map[ext] || "plaintext";
}

export default function FilePreviewModal({ filePath, fileName, onClose }: FilePreviewModalProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileType = getFileType(fileName);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const text = await invoke<string>("read_text_file", { path: filePath });
      setContent(text);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const renderMarkdown = async () => {
    try {
      const { marked } = await import("marked");
      const hljs = await import("highlight.js");
      const renderer = new marked.Renderer();
      renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
        if (lang && hljs.default.getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${hljs.default.highlight(text, { language: lang }).value}</code></pre>`;
        }
        return `<pre><code class="hljs">${hljs.default.highlightAuto(text).value}</code></pre>`;
      };
      return marked.parse(content, { renderer }) as string;
    } catch {
      return `<pre>${content}</pre>`;
    }
  };

  const renderCode = async () => {
    try {
      const hljs = await import("highlight.js");
      const lang = getLanguage(fileName);
      const result = hljs.default.highlight(content, { language: lang });
      return `<pre><code class="hljs language-${lang}">${result.value}</code></pre>`;
    } catch {
      return `<pre>${content}</pre>`;
    }
  };

  const renderWord = async () => {
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = new TextEncoder().encode(content).buffer;
      const result = await mammoth.default.convertToHtml({ arrayBuffer });
      return result.value;
    } catch {
      return `<p>Word 文件预览失败，请尝试直接打开文件</p>`;
    }
  };

  const [renderedHtml, setRenderedHtml] = useState("");

  useEffect(() => {
    if (loading || error) return;
    const render = async () => {
      let html = "";
      switch (fileType) {
        case "markdown":
          html = await renderMarkdown();
          break;
        case "code":
          html = await renderCode();
          break;
        case "word":
          html = await renderWord();
          break;
        case "html":
          html = content;
          break;
        default:
          html = `<pre>${content}</pre>`;
      }
      setRenderedHtml(html);
    };
    render();
  }, [content, fileType, loading, error]);

  return (
    <div
      className="file-preview-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="file-preview-modal">
        <div className="file-preview-header">
          <div className="file-preview-title">
            <span className="file-preview-type-badge">{fileType}</span>
            <h3>{fileName}</h3>
          </div>
          <button className="file-preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="file-preview-body">
          {loading && (
            <div className="file-preview-loading">
              <span className="loading-spinner">⏳</span>
              <p>加载中...</p>
            </div>
          )}
          {error && (
            <div className="file-preview-error">
              <p>❌ {error}</p>
            </div>
          )}
          {!loading && !error && fileType === "pdf" && (
            <iframe
              src={filePath}
              className="file-preview-pdf"
              title={fileName}
            />
          )}
          {!loading && !error && fileType === "html" && (
            <iframe
              srcDoc={content}
              className="file-preview-iframe"
              title={fileName}
              sandbox="allow-same-origin"
            />
          )}
          {!loading && !error && fileType !== "pdf" && fileType !== "html" && (
            <div
              className="file-preview-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
