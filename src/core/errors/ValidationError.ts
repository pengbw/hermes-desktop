import { AppError } from "./AppError";

export class ValidationError extends AppError {
  readonly fields: Record<string, string>;

  constructor(message: string, options?: { fields?: Record<string, string>; code?: string }) {
    super(message, { category: "validation", code: options?.code ?? "VALIDATION_ERROR" });
    this.name = "ValidationError";
    this.fields = options?.fields ?? {};
  }
}
