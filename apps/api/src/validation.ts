import { z } from 'zod';
const bounded = (n: number) => z.number().finite().min(0).max(n);
export const eventSchema = z.object({
  eventId: z.string().min(8).max(100), projectId: z.string().min(1).max(100), sessionId: z.string().min(8).max(120),
  eventType: z.enum(['page_view','click']), pageUrl: z.string().url().max(2048), pagePath: z.string().max(2048),
  pageTitle: z.string().max(300).default(''), referrer: z.string().max(2048).optional(),
  timestamp: z.coerce.date(), viewport: z.object({ width: bounded(20000), height: bounded(20000) }),
  screen: z.object({ width: bounded(20000), height: bounded(20000) }),
  device: z.object({ category: z.enum(['desktop','tablet','mobile']).optional(), browser: z.string().max(80).optional(), os: z.string().max(80).optional() }).optional(),
  click: z.object({ x: bounded(20000), y: bounded(20000), normalizedX: z.number().min(0).max(1), normalizedY: z.number().min(0).max(1) }).optional(),
  element: z.object({ tag: z.string().max(30).optional(), selector: z.string().max(200).optional(), label: z.string().max(100).optional() }).optional(),
}).superRefine((e, ctx) => {
  if (e.eventType === 'click' && !e.click) ctx.addIssue({ code: 'custom', path: ['click'], message: 'Click coordinates are required for click events' });
  if (e.eventType === 'page_view' && e.click) ctx.addIssue({ code: 'custom', path: ['click'], message: 'Page views cannot include click coordinates' });
  if (Math.abs(e.timestamp.getTime() - Date.now()) > 1000 * 60 * 60 * 24 * 30) ctx.addIssue({ code: 'custom', path: ['timestamp'], message: 'Timestamp must be within 30 days' });
});
export const eventBatchSchema = z.union([eventSchema, z.array(eventSchema).min(1).max(100)]);
