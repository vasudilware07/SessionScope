export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
export const PROJECT = import.meta.env.VITE_PROJECT_ID ?? 'demo-project';
export const DEMO_URL = import.meta.env.VITE_DEMO_URL ?? 'http://localhost:5174';
export const TRACKER_URL = import.meta.env.VITE_TRACKER_URL ?? `${DEMO_URL}/tracker.js`;
export async function api<T>(path: string, init?: RequestInit): Promise<{data:T;meta?:any}> { const response = await fetch(`${API_URL}${path}${path.includes('?')?'&':'?'}projectId=${encodeURIComponent(PROJECT)}`, init); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body?.error?.message ?? `API request failed (${response.status})`); } return response.json(); }
export const query = (params: Record<string,string|number|undefined>) => new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>[k,String(v)])).toString();
