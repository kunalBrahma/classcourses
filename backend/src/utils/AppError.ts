export class AppError extends Error {
  public readonly statusCode: number;
  // Optional machine-readable reason the client can act on (e.g. "EMAIL_NOT_VERIFIED").
  public readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
