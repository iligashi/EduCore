const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const tokenStore = {
  get accessToken() {
    return localStorage.getItem("educore.accessToken");
  },
  set accessToken(value: string | null) {
    if (value) localStorage.setItem("educore.accessToken", value);
    else localStorage.removeItem("educore.accessToken");
  },
  get refreshToken() {
    return localStorage.getItem("educore.refreshToken");
  },
  set refreshToken(value: string | null) {
    if (value) localStorage.setItem("educore.refreshToken", value);
    else localStorage.removeItem("educore.refreshToken");
  }
};

async function refreshAccessToken() {
  if (!tokenStore.refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ refreshToken: tokenStore.refreshToken })
  });
  if (!response.ok) return false;
  const data = await response.json();
  tokenStore.accessToken = data.accessToken;
  tokenStore.refreshToken = data.refreshToken;
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (tokenStore.accessToken) headers.set("Authorization", `Bearer ${tokenStore.accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && retry && (await refreshAccessToken())) {
    return request<T>(path, init, false);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message ?? "Request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {})
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body ?? {})
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body ?? {})
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" })
};

export { API_URL };

