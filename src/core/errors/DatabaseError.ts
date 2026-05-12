import { AppError } from "./AppError";

export class DatabaseError extends AppError {
  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message, {
      category: "database",
      code: options?.code ?? "DB_ERROR",
      details: options?.details,
    });
    this.name = "DatabaseError";
  }
}
