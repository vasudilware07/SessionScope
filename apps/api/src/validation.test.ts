import { describe, expect, it } from 'vitest';
import { eventSchema } from './validation.js';
const base = { eventId:'event-00000001', projectId:'demo-project', sessionId:'session-000001', eventType:'page_view' as const, pageUrl:'https://example.com/', pagePath:'/', pageTitle:'Example', timestamp:new Date().toISOString(), viewport:{width:1280,height:720}, screen:{width:1920,height:1080} };
describe('event validation', () => {
  it('accepts a page view', () => expect(eventSchema.safeParse(base).success).toBe(true));
  it('requires bounded normalized coordinates for clicks', () => { expect(eventSchema.safeParse({ ...base, eventType:'click', click:{x:10,y:10,normalizedX:0.5,normalizedY:1.1} }).success).toBe(false); });
  it('requires coordinates on click events', () => expect(eventSchema.safeParse({ ...base, eventType:'click' }).success).toBe(false));
});
