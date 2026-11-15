import axios from 'axios';

const TOKEN_KEY = 'hio_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

/** Human-readable error message from an Axios error (includes field details when present). */
export function errorMessage(error, fallback = 'Something went wrong') {
  if (!error?.response) return error?.message === 'Network Error' ? 'Cannot reach the server. Is the API running?' : error?.message || fallback;
  return error.response.data?.message || fallback;
}

export function fieldErrors(error) {
  const details = error?.response?.data?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((d) => [d.field, d.message]));
}

/** Downloads a file response (CSV/PDF) with the auth header. */
export async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = match?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
