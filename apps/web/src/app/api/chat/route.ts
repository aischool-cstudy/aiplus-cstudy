import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_ASSISTANT_PERSONA, normalizeAssistantPersona } from '@/lib/ai/personas';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

interface IncomingMessage {
  role?: string;
  content?: string;
  parts?: Array<{ type?: string; text?: string }>;
}

function getCurriculumDay(startDateValue: string | null, totalDays: number): number {
  if (!startDateValue) return 1;
  const startDate = new Date(`${startDateValue}T00:00:00`);
  const now = new Date();
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.min(Math.max(1, elapsedDays + 1), Math.max(1, totalDays));
}

function extractMessageText(message: IncomingMessage): string {
  if (Array.isArray(message.parts)) {
    const fromParts = message.parts
      .filter((part) => part?.type === 'text' && typeof part?.text === 'string')
      .map((part) => part.text!.trim())
      .filter(Boolean)
      .join('\n');
    if (fromParts) return fromParts;
  }
  return (message.content || '').trim();
}

function normalizeMessages(messages: IncomingMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
    if (!role) continue;
    const content = extractMessageText(message);
    if (!content) continue;
    normalized.push({ role, content });
  }
  return normalized.slice(-20);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const rawMessages = Array.isArray(body.messages) ? (body.messages as IncomingMessage[]) : [];
  const messages = normalizeMessages(rawMessages);
  const chatType: 'manager' | 'tutor' = body.chatType === 'tutor' ? 'tutor' : 'manager';
  const contextId: string | undefined = typeof body.contextId === 'string' ? body.contextId : undefined;
  const context: Record<string, unknown> = body.context && typeof body.context === 'object' ? body.context : {};
  const learnerContext = await getLearnerChatContext(supabase, user.id);
  const baseContext = {
    ...context,
    assistantPersona: learnerContext.assistantPersona || DEFAULT_ASSISTANT_PERSONA,
  };

  const mergedContext = chatType === 'manager'
    ? { ...(await getManagerContext(supabase, user.id, learnerContext)), ...baseContext }
    : baseContext;

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content;
  if (lastUserMessage) {
    void supabase.from('chat_messages').insert({
      user_id: user.id,
      chat_type: chatType,
      context_id: contextId || null,
      role: 'user',
      content: lastUserMessage,
    });
  }

  try {
    const response = await fetch(`${FASTAPI_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatType,
        contextId,
        context: mergedContext,
        messages,
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      return NextResponse.json(
        { error: `Chat upstream failed: ${response.status}`, detail: raw.slice(0, 200) || null },
        { status: 502 }
      );
    }

    const data = await response.json() as { assistant?: string };
    const assistantText = (data.assistant || '').trim();
    if (!assistantText) {
      return NextResponse.json(
        { error: 'Chat upstream returned empty assistant message' },
        { status: 502 }
      );
    }

    void supabase.from('chat_messages').insert({
      user_id: user.id,
      chat_type: chatType,
      context_id: contextId || null,
      role: 'assistant',
      content: assistantText,
    });

    return NextResponse.json({
      assistant: assistantText,
      chatType,
      contextId: contextId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json(
      { error: 'Chat upstream unavailable', detail: message },
      { status: 502 }
    );
  }
}

async function getManagerContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  learner: LearnerChatContext
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', userId)
    .single();

  const { data: curriculums } = await supabase
    .from('user_curriculums')
    .select('id, title, goal, status, total_days, start_date, assessed_level')
    .eq('user_id', userId)
    .in('status', ['active', 'paused']);

  const curriculumStats = [];
  if (curriculums) {
    for (const curriculum of curriculums) {
      const { data: items } = await supabase
        .from('curriculum_items')
        .select('status, day_number')
        .eq('curriculum_id', curriculum.id);

      const completed = items?.filter((item) => item.status === 'completed').length || 0;
      const total = items?.length || 0;
      const currentDay = getCurriculumDay(curriculum.start_date ?? null, curriculum.total_days || 1);

      curriculumStats.push({
        title: curriculum.title,
        goal: curriculum.goal,
        status: curriculum.status,
        completed,
        total,
        currentDay,
        totalDays: curriculum.total_days,
      });
    }
  }

  const { data: recentCompleted } = await supabase
    .from('curriculum_items')
    .select('title, completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(5);

  return {
    userName: profile?.name || '학습자',
    goal: learner.goal || '',
    level: learner.level || 'beginner',
    interests: learner.interests || [],
    assistantPersona: learner.assistantPersona || DEFAULT_ASSISTANT_PERSONA,
    curriculumStats,
    recentCompleted: recentCompleted || [],
  };
}

interface LearnerChatContext {
  goal: string;
  level: string;
  interests: string[];
  assistantPersona: string;
}

async function getLearnerChatContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<LearnerChatContext> {
  const { data: learner } = await supabase
    .from('learner_profiles')
    .select('goal, level, interests, assistant_persona')
    .eq('user_id', userId)
    .single();

  return {
    goal: String(learner?.goal || ''),
    level: String(learner?.level || 'beginner'),
    interests: Array.isArray(learner?.interests)
      ? learner.interests.map((item: unknown) => String(item))
      : [],
    assistantPersona: normalizeAssistantPersona(
      typeof learner?.assistant_persona === 'string' ? learner.assistant_persona : null
    ),
  };
}
