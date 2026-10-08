/** Error HTTP controlado. `headers` permite devolver Retry-After, X-RateLimit-*, etc. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public headers?: Record<string, string>) { super(message); }
}
