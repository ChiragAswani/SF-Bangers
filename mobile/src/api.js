import * as SecureStore from 'expo-secure-store';
import { BACKEND_URL } from './config';

const SESSION_STORE_KEY = 'sfb_session_id';

let cachedSessionId;

export async function getStoredSessionId() {
  if (cachedSessionId !== undefined) return cachedSessionId;
  cachedSessionId = await SecureStore.getItemAsync(SESSION_STORE_KEY);
  return cachedSessionId;
}

export async function setStoredSessionId(sessionId) {
  cachedSessionId = sessionId || null;
  if (sessionId) {
    await SecureStore.setItemAsync(SESSION_STORE_KEY, sessionId);
  } else {
    await SecureStore.deleteItemAsync(SESSION_STORE_KEY);
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function buildUrl(path, params) {
  let url = `${BACKEND_URL}${path}`;
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length) {
    const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    url += `?${qs}`;
  }
  return url;
}

async function request(path, { method = 'GET', params, body } = {}) {
  const sessionId = await getStoredSessionId();
  const headers = { Accept: 'application/json' };
  if (sessionId) headers.Authorization = `Bearer ${sessionId}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError('Network request failed', 0);
  }

  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText || 'Request failed', res.status);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
};
