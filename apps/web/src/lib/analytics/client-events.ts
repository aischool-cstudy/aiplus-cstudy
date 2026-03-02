'use client';

interface RecommendationEventPayload {
  surface: string;
  actionType: 'impression' | 'click' | 'start' | 'complete' | 'dismiss';
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export function trackRecommendationEvent(payload: RecommendationEventPayload) {
  try {
    void fetch('/api/events/recommendation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // fire-and-forget
  }
}
