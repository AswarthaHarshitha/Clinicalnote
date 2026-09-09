export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorBody(code: string, message: string) {
  return { success: false, error: { code, message } } as const;
}
