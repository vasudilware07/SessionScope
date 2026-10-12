import type { TrackingEvent } from '@sessionscope/shared-types';

export interface TrackerOptions { projectId: string; endpoint?: string; sessionTimeoutMinutes?: number; storageKey?: string; optOutKey?: string; onAccepted?: (count: number) => void; onError?: () => void }
const SESSION_KEY = 'sessionscope_session';
function uuid(): string { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); if (globalThis.crypto?.getRandomValues) { const b = globalThis.crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(x => x.toString(16).padStart(2, '0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; } throw new Error('Secure random values are unavailable'); }
function sessionId(key: string, timeoutMs: number): string {
  try { const raw = localStorage.getItem(key); if (raw) { const old = JSON.parse(raw) as { id: string; last: number }; if (Date.now() - old.last <= timeoutMs) { localStorage.setItem(key, JSON.stringify({ ...old, last: Date.now() })); return old.id; } } const id = uuid(); localStorage.setItem(key, JSON.stringify({ id, last: Date.now() })); return id; } catch { return uuid(); }
}
function device(): TrackingEvent['device'] { const ua = navigator.userAgent; return { category: /Mobi|Android/i.test(ua) ? 'mobile' : /Tablet|iPad/i.test(ua) ? 'tablet' : 'desktop', browser: /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other', os: /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : 'Other' }; }
function safeLabel(el: Element): string | undefined {
  const html = el as HTMLElement; const input = el as HTMLInputElement;
  if (el.closest('input,textarea,select,[contenteditable="true"],[data-ss-ignore]') || ['password','email','tel','number'].includes(input.type)) return undefined;
  const text = (html.getAttribute?.('aria-label') || html.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!text || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d ().-]{7,}\d/.test(text)) return undefined;
  return text.slice(0, 80);
}
function safeSelector(el: Element) { const id = el.id; return id && /^[A-Za-z_-][A-Za-z0-9_-]{0,79}$/.test(id) ? `#${id}` : el.tagName.toLowerCase(); }
function safeReferrer() { try { if (!document.referrer) return undefined; const ref = new URL(document.referrer); return `${ref.origin}${ref.pathname}`.slice(0, 2048); } catch { return undefined; } }
function context(projectId: string, sid: string, eventType: TrackingEvent['eventType']): Omit<TrackingEvent, 'eventId'|'timestamp'|'click'|'element'> {
  const url = new URL(location.href); url.search = ''; url.hash = '';
  return { projectId, sessionId: sid, eventType, pageUrl: url.toString(), pagePath: location.pathname, pageTitle: document.title.slice(0, 300), referrer: safeReferrer(), viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height }, device: device() };
}
export function createTracker(options: TrackerOptions) {
  const endpoint = options.endpoint ?? '/api/v1/events'; const key = options.storageKey ?? SESSION_KEY; const timeout = (options.sessionTimeoutMinutes ?? 30) * 60_000;
  const optOut = () => { try { return localStorage.getItem(options.optOutKey ?? 'sessionscope_opt_out') === 'true'; } catch { return false; } };
  let sid = sessionId(key, timeout); let queue: TrackingEvent[] = []; let retryTimer: ReturnType<typeof setTimeout> | undefined; let destroyed = false;
  const send = async () => {
    if (destroyed || optOut() || queue.length === 0) return;
    const batch = queue.slice(0, 20);
    try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch), keepalive: true }); if (!response.ok) throw new Error(`HTTP ${response.status}`); queue.splice(0, batch.length); (send as any).attempt = 0; options.onAccepted?.(batch.length); }
    catch { options.onError?.(); const attempt = Math.min(6, (send as any).attempt = ((send as any).attempt ?? 0) + 1); retryTimer = setTimeout(send, Math.min(30_000, 500 * 2 ** attempt)); }
  };
  const track = (partial: Partial<TrackingEvent>) => { if (optOut() || destroyed) return; sid = sessionId(key, timeout); queue.push({ ...context(options.projectId, sid, partial.eventType ?? 'page_view'), eventId: uuid(), timestamp: new Date().toISOString(), ...partial } as TrackingEvent); if (queue.length > 100) queue.shift(); void send(); };
  const clickHandler = (event: MouseEvent) => { const raw = event.target instanceof Element ? event.target : null; if (!raw || raw.closest('[data-ss-ignore],input,textarea,select,[contenteditable="true"]')) return; const target = raw.closest('a,button,[role="button"],input[type="button"],input[type="submit"]') ?? raw; track({ eventType: 'click', click: { x: Math.max(0, event.clientX), y: Math.max(0, event.clientY), normalizedX: Math.max(0, Math.min(1, event.clientX / Math.max(1, innerWidth))), normalizedY: Math.max(0, Math.min(1, event.clientY / Math.max(1, innerHeight))) }, element: { tag: target.tagName.toLowerCase(), selector: safeSelector(target), label: safeLabel(target) } }); };
  const flush = () => { if (queue.length) { const body = JSON.stringify(queue.slice(0, 20)); if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) queue.splice(0, 20); else void send(); } };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
  if (!(window as any).__sessionscopeInitialized) { (window as any).__sessionscopeInitialized = true; document.addEventListener('click', clickHandler, true); document.addEventListener('visibilitychange', onVisibility); window.addEventListener('pagehide', flush); track({ eventType: 'page_view' }); }
  return { sessionId: sid, track, flush, get pendingCount() { return queue.length; }, destroy() { destroyed = true; document.removeEventListener('click', clickHandler, true); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', flush); if (retryTimer) clearTimeout(retryTimer); (window as any).__sessionscopeInitialized = false; } };
}

const script = document.currentScript as HTMLScriptElement | null;
if (typeof window !== 'undefined' && script?.dataset.projectId) {
  const api = script.dataset.apiUrl ?? `${location.protocol}//${location.hostname}:4000/api/v1/events`;
  (window as any).sessionScopeTracker = createTracker({ projectId: script.dataset.projectId, endpoint: api });
}
