export type EventType = 'page_view' | 'click';
export interface TrackingEvent {
  eventId: string; projectId: string; sessionId: string; eventType: EventType;
  pageUrl: string; pagePath: string; pageTitle: string; referrer?: string; timestamp: string;
  viewport: { width: number; height: number }; screen: { width: number; height: number };
  device?: { category?: 'desktop'|'tablet'|'mobile'; browser?: string; os?: string };
  click?: { x: number; y: number; normalizedX: number; normalizedY: number };
  element?: { tag?: string; selector?: string; label?: string };
}
export interface ApiResponse<T> { data: T; meta?: Record<string, unknown> }
