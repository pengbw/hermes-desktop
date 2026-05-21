import MarkdownRenderer from "@components/MarkdownRenderer";

interface StreamingIndicatorProps {
  isStreaming: boolean;
  isThinking: boolean;
  thinkingContent: string;
  streamedContent: string;
  toolProgress: string;
}

export default function StreamingIndicator({
  isStreaming,
  isThinking,
  thinkingContent,
  streamedContent,
  toolProgress,
}: StreamingIndicatorProps) {
  if (isStreaming && streamedContent) {
    return (
      <div className="flex gap-2.5 items-start">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden bg-muted">
          <img src="/bot.svg" alt="bot" className="w-full h-full object-cover" />
        </div>
        <div className="max-w-[70%] px-3 py-2 rounded-xl text-[13px] leading-relaxed bg-muted text-foreground rounded-bl-sm">
          <div className="break-words leading-relaxed select-text">
            <MarkdownRenderer content={streamedContent} />
          </div>
          <span className="inline-block text-primary animate-pulse ml-0.5">▊</span>
        </div>
      </div>
    );
  }

  if (isThinking) {
    return (
      <div className="flex gap-2.5 items-start">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden bg-muted">
          <img src="/bot.svg" alt="bot" className="w-full h-full object-cover" />
        </div>
        <div className="max-w-[70%] px-4 py-3 rounded-xl border relative overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 border-primary/10 dark:from-blue-950/30 dark:to-purple-950/30">
          <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-sky-400 to-purple-500 rounded-full" />
          <span className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5 font-medium tracking-wide">
            {toolProgress || "思考中"}
            {!toolProgress && (
              <span className="inline-flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "160ms" }} />
                <span className="w-1 h-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "320ms" }} />
              </span>
            )}
          </span>
          {thinkingContent && (
            <pre className="font-mono text-xs text-muted-foreground m-0 whitespace-pre-wrap break-words leading-relaxed max-h-[120px] overflow-y-auto">
              {thinkingContent}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return null;
}
