import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ACTIONS = new Set(['impression', 'click', 'start', 'complete', 'dismiss']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    surface?: string;
    actionType?: string;
    targetType?: string;
    targetId?: string;
    payload?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const surface = String(body.surface || '').trim();
  const actionType = String(body.actionType || '').trim();
  const targetType = body.targetType ? String(body.targetType).trim() : null;
  const targetId = body.targetId ? String(body.targetId).trim() : null;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

  if (!surface || !ALLOWED_ACTIONS.has(actionType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await supabase
    .from('recommendation_events')
    .insert({
      user_id: user.id,
      surface,
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      payload,
    });

  if (error && error.message.includes('recommendation_events')) {
    // 마이그레이션 전 하위 호환
    return NextResponse.json({ ok: true });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
