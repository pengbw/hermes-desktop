export interface ProcessedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  files?: string[];
  image?: string;
}

export interface MessageProcessingOptions {
  trimContent?: boolean;
  maxContentLength?: number;
  placeholderForEmptyFile?: string;
}

const DEFAULT_OPTIONS: Required<MessageProcessingOptions> = {
  trimContent: true,
  maxContentLength: 0,
  placeholderForEmptyFile: "请分析附件中的文件",
};

export function processUserMessage(
  rawContent: string,
  attachedFiles?: string,
  options: MessageProcessingOptions = {}
): ProcessedMessage {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let content = rawContent;

  if (opts.trimContent) {
    content = content.trim();
  }

  if (!content && attachedFiles) {
    content = opts.placeholderForEmptyFile;
  }

  if (opts.maxContentLength > 0 && content.length > opts.maxContentLength) {
    content = content.slice(0, opts.maxContentLength);
  }

  const result: ProcessedMessage = {
    role: "user",
    content,
  };

  if (attachedFiles) {
    try {
      const files: Array<{ name: string; path: string }> = JSON.parse(attachedFiles);
      result.files = files.map((f) => f.path);

      const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
      const imageFile = files.find((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ext && imageExtensions.includes(ext);
      });
      if (imageFile) {
        result.image = imageFile.path;
      }
    } catch {}
  }

  return result;
}

export function formatConversationTitle(content: string, maxLength: number = 30): string {
  const trimmed = content.trim();
  if (!trimmed) return "新对话";
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) + "..." : trimmed;
}

export function extractFileNames(filesJson: string): string[] {
  try {
    const files: Array<{ name: string; path: string }> = JSON.parse(filesJson);
    return files.map((f) => f.name);
  } catch {
    return [];
  }
}
