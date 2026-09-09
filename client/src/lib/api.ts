export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; pageSize: number; total: number };
  error?: { code: string; message: string };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: isFormData
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers },
  });

  let body: ApiEnvelope<T>;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, "NETWORK_ERROR", "Unable to reach the server. Check your connection.");
  }

  if (!res.ok || body.success === false) {
    throw new ApiRequestError(res.status, body.error?.code ?? "UNKNOWN_ERROR", body.error?.message ?? "Something went wrong.");
  }
  return body;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }).then((r) => r),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data instanceof FormData ? data : JSON.stringify(data ?? {}) }).then((r) => r),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }).then((r) => r),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }).then((r) => r),
};
