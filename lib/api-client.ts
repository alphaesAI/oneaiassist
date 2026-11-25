export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: any) {
    super(message);
  }
}

export async function api<T = any>(url: string, body?: unknown, method?: string): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/auth/')) {
    window.location.href = '/login';
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.details);
  return data as T;
}
