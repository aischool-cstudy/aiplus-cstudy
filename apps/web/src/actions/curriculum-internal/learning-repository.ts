import { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface CurriculumItemRow {
  id: string;
  title: string;
  description: string | null;
  day_number: number;
  order_in_day: number;
  cached_reasoning?: unknown;
}

interface CurriculumRow {
  id: string;
  goal: string;
  assessed_level: string;
  teaching_method?: string | null;
}

interface LearnerProfileRow {
  level?: string | null;
  interests?: string[] | null;
  preferred_teaching_method?: string | null;
  learning_style?: string | null;
}

export interface LearningGenerationContext {
  item: CurriculumItemRow;
  curriculum: CurriculumRow;
  prevTopics: string[];
  nextTopics: string[];
  learner: LearnerProfileRow | null;
  recentFeedback: { understanding_rating: number; difficult_concepts: string[] }[];
  conceptFocus: {
    concept_tag: string;
    mastery_score: number;
    forgetting_risk: number;
    confidence_score: number;
  }[];
}

export async function loadLearningGenerationContext(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    itemId: string;
    curriculumId: string;
  }
): Promise<{ context?: LearningGenerationContext; error?: string }> {
  const { data: item } = await supabase
    .from('curriculum_items')
    .select('*')
    .eq('id', params.itemId)
    .single();
  if (!item) {
    return { error: '학습 항목을 찾을 수 없습니다.' };
  }

  const { data: curriculum } = await supabase
    .from('user_curriculums')
    .select('*')
    .eq('id', params.curriculumId)
    .single();
  if (!curriculum) {
    return { error: '커리큘럼을 찾을 수 없습니다.' };
  }

  const { data: allItems } = await supabase
    .from('curriculum_items')
    .select('title, day_number, order_in_day')
    .eq('curriculum_id', params.curriculumId)
    .order('day_number')
    .order('order_in_day');

  const items = allItems || [];
  const currentIdx = items.findIndex(
    (row) => row.title === item.title && row.day_number === item.day_number
  );
  const prevTopics = items.slice(Math.max(0, currentIdx - 3), currentIdx).map((row) => row.title);
  const nextTopics = items.slice(currentIdx + 1, currentIdx + 3).map((row) => row.title);

  const { data: learner } = await supabase
    .from('learner_profiles')
    .select('*')
    .eq('user_id', params.userId)
    .single();

  let recentFeedback: { understanding_rating: number; difficult_concepts: string[] }[] = [];
  const { data: feedbackRows, error: feedbackError } = await supabase
    .from('learning_feedback')
    .select('understanding_rating, difficult_concepts')
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!feedbackError && feedbackRows) {
    recentFeedback = feedbackRows
      .filter((row) => typeof row.understanding_rating === 'number')
      .map((row) => ({
        understanding_rating: row.understanding_rating as number,
        difficult_concepts: Array.isArray(row.difficult_concepts)
          ? row.difficult_concepts.map((value) => String(value))
          : [],
      }));
  }

  let conceptFocus: {
    concept_tag: string;
    mastery_score: number;
    forgetting_risk: number;
    confidence_score: number;
  }[] = [];
  const { data: conceptRows, error: conceptError } = await supabase
    .from('learner_concept_state')
    .select('concept_tag, mastery_score, forgetting_risk, confidence_score')
    .eq('user_id', params.userId)
    .order('forgetting_risk', { ascending: false })
    .limit(5);

  if (!conceptError && conceptRows) {
    conceptFocus = conceptRows
      .map((row) => ({
        concept_tag: String(row.concept_tag || '').trim(),
        mastery_score: Number(row.mastery_score ?? 0),
        forgetting_risk: Number(row.forgetting_risk ?? 0),
        confidence_score: Number(row.confidence_score ?? 0),
      }))
      .filter((row) => row.concept_tag.length > 0)
      .sort((a, b) => b.forgetting_risk - a.forgetting_risk || a.mastery_score - b.mastery_score)
      .slice(0, 4);
  }

  return {
    context: {
      item: item as CurriculumItemRow,
      curriculum: curriculum as CurriculumRow,
      prevTopics,
      nextTopics,
      learner: (learner || null) as LearnerProfileRow | null,
      recentFeedback,
      conceptFocus,
    },
  };
}

export async function cacheReasoningForItem(
  supabase: SupabaseServerClient,
  itemId: string,
  reasoning: unknown
): Promise<void> {
  await supabase
    .from('curriculum_items')
    .update({ cached_reasoning: reasoning })
    .eq('id', itemId);
}

export async function persistGeneratedCurriculumContent(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    itemId: string;
    language: string;
    topic: string;
    learnerLevel: string;
    targetAudience: string;
    teachingMethod: string;
    title: string;
    sections: unknown[];
    reasoning: unknown;
  }
): Promise<{ contentId?: string; dbErrorMessage?: string }> {
  let { data: saved, error: saveError } = await supabase
    .from('generated_contents')
    .insert({
      user_id: params.userId,
      language: params.language,
      topic: params.topic,
      difficulty: params.learnerLevel,
      target_audience: params.targetAudience,
      teaching_method: params.teachingMethod,
      title: params.title,
      content: '',
      code_examples: [],
      quiz: [],
      sections: params.sections,
      reasoning: params.reasoning,
      content_version: 2,
    })
    .select()
    .single();

  if (saveError && saveError.message.includes('teaching_method')) {
    const retry = await supabase
      .from('generated_contents')
      .insert({
        user_id: params.userId,
        language: params.language,
        topic: params.topic,
        difficulty: params.learnerLevel,
        target_audience: params.targetAudience,
        title: params.title,
        content: '',
        code_examples: [],
        quiz: [],
        sections: params.sections,
        reasoning: params.reasoning,
        content_version: 2,
      })
      .select()
      .single();
    saved = retry.data;
    saveError = retry.error;
  }

  if (saveError || !saved) {
    return { dbErrorMessage: saveError?.message || 'unknown db error' };
  }

  await supabase
    .from('curriculum_items')
    .update({ content_id: saved.id, status: 'in_progress', cached_reasoning: null })
    .eq('id', params.itemId);

  return { contentId: saved.id };
}
