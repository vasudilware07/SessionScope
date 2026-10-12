import { describe, expect, it, vi } from 'vitest';
import { createTracker } from './index.js';
describe('tracking SDK', () => {
  it('persists a session and sends a page view once', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch);
    const tracker = createTracker({ projectId:'demo-project', endpoint:'/events', storageKey:'test-session', optOutKey:'test-opt-out' });
    await new Promise(r=>setTimeout(r,0));
    expect(fetch).toHaveBeenCalledTimes(1);
    const event = JSON.parse(fetch.mock.calls[0][1].body)[0];
    expect(event.eventType).toBe('page_view'); expect(event.sessionId).toBe(tracker.sessionId); expect(localStorage.getItem('test-session')).toContain(tracker.sessionId);
    tracker.destroy(); vi.unstubAllGlobals();
  });
  it('respects opt-out', async () => {
    localStorage.setItem('test-opt-out','true'); const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    const tracker=createTracker({projectId:'demo-project',endpoint:'/events',storageKey:'test-session',optOutKey:'test-opt-out'}); await new Promise(r=>setTimeout(r,0));
    expect(fetch).not.toHaveBeenCalled(); tracker.destroy(); localStorage.removeItem('test-opt-out'); vi.unstubAllGlobals();
  });
  it('captures viewport-normalized clicks without email labels', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch);
    const tracker = createTracker({ projectId:'demo-project', endpoint:'/events', storageKey:'test-session', optOutKey:'test-opt-out' });
    await new Promise(r=>setTimeout(r,0));
    const button=document.createElement('button');button.textContent='Contact alice@example.com';document.body.append(button);
    button.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:100,clientY:80}));await new Promise(r=>setTimeout(r,0));
    const batches=fetch.mock.calls.map(call=>JSON.parse(call[1].body));const event=batches.flat().find((x:any)=>x.eventType==='click');
    expect(event.click.normalizedX).toBeCloseTo(100/innerWidth);expect(event.click.normalizedY).toBeCloseTo(80/innerHeight);expect(event.element.label).toBeUndefined();
    button.remove();tracker.destroy();vi.unstubAllGlobals();
  });
});
