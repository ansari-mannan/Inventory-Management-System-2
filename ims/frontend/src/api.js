// All requests use the relative /api path. In dev this is proxied by Vite to
// the backend; in production the K8s ingress routes /api to the backend service.
const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const listItems = (search = '') => {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return request(`/items${qs}`);
};

export const createItem = (item) =>
  request('/items', { method: 'POST', body: JSON.stringify(item) });

export const updateItem = (id, item) =>
  request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) });

export const deleteItem = (id) =>
  request(`/items/${id}`, { method: 'DELETE' });
