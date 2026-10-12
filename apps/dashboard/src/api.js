const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const PROJECT = import.meta.env.VITE_PROJECT_ID ?? 'demo-project';
export async function api(path, init) { const response = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}projectId=${encodeURIComponent(PROJECT)}`, init); if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API request failed (${response.status})`);
} return response.json(); }
export const query = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
