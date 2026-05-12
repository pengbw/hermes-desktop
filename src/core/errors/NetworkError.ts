import { AppError } from "./AppError";

export class NetworkError extends AppError {
  readonly statusCode?: number;

  constructor(
    message: string,
    options?: { code?: string; statusCode?: number; details?: unknown }
  ) {
    super(message, {
      category: "network",
      code: options?.code ?? "NETWORK_ERROR",
      details: options?.details,
    });
    this.name = "NetworkError";
    this.statusCode = options?.statusCode;
  }
}
