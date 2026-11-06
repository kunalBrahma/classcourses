export class AppError extends Error {
  public readonly statusCode: number;
  // Optional machine-readable reason the client can act on (e.g. "EMAIL_NOT_VERIFIED").
  public readonly code?: string;
  // Optional extra fields for the client (e.g. retryAfter seconds). Never secrets.
  public readonly details?: Record<string, string | number | boolean | null>;

  constructor(statusCode: number, message: string, code?: string, details?: Record<string, string | number | boolean | null>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
