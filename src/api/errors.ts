export type ApiErrorCode = "network" | "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "unavailable";

/** Every API failure is one of these, with a message that is safe to show as is. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    /** Extra facts a screen can use, such as the next free slots when one was just taken. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Network failures are worth retrying. A refusal or a missing record will not change on retry. */
export const isRetryable = (e: unknown): boolean => !isApiError(e) || e.code === "network";
