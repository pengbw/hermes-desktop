export type ErrorCategory = "app" | "database" | "network" | "validation" | "vrm" | "tauri";

export class AppError extends Error {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly details?: unknown;
  readonly timestamp: number;

  constructor(
    message: string,
    options?: {
      category?: ErrorCategory;
      code?: string;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.category = options?.category ?? "app";
    this.code = options?.code ?? "UNKNOWN";
    this.details = options?.details;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}
