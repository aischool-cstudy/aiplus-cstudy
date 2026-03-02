// ==========================================
// Database / Domain Types
// ==========================================

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro';
  daily_generations_remaining: number;
  daily_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerProfile {
  id: string;
  user_id: string;
  onboarding_completed: boolean;
  goal: string | null;
  goal_type: 'job' | 'work' | 'hobby' | 'project';
  background: string | null;
  interests: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  preferred_teaching_method: string | null;
  assistant_persona: 'coach' | 'mate';
  weekly_study_hours: number;
  learning_style: 'concept_first' | 'problem_solving' | 'project_building';
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  slug: string;
  name: string;
  description: string;
  order: number;
  created_at: string;
}

export interface Topic {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  description: string | null;
  order: number;
  content_id: string | null;
  created_at: string;
}

export interface GeneratedContent {
  id: string;
  user_id: string;
  content_kind?: 'lesson' | 'practice_set' | null;
  language: string;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  target_audience: string;
  teaching_method: string | null;
  title: string;
  content: string;
  code_examples: CodeExample[];
  quiz: QuizQuestion[];
  // v2: 섹션 기반 콘텐츠
  sections: ContentSection[] | null;
  reasoning: PedagogicalReasoning | null;
  content_version: number;
  created_at: string;
}

export interface CodeExample {
  title: string;
  code: string;
  explanation: string;
  language: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
}

// ==========================================
// v2: 섹션 기반 콘텐츠
// ==========================================

export interface ContentSection {
  type: 'motivation' | 'concept' | 'example' | 'check' | 'summary';
  title?: string;
  body?: string;
  code?: string;
  language?: string;
  explanation?: string;
  question?: string;
  options?: string[];
  correct_answer?: number;
  next_preview?: string;
}

export interface PedagogicalReasoning {
  learning_objectives: string[];
  prerequisite_concepts: string[];
  why_this_topic: string;
  teaching_strategy: string;
  difficulty_calibration: string;
  connection_to_goal: string;
}

export interface LearningProgress {
  id: string;
  user_id: string;
  topic_id: string | null;
  content_id: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: string | null;
  quiz_score: number | null;
  understanding_rating: number | null;
  difficult_concepts: string[] | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Curriculum Types
// ==========================================

export interface UserCurriculum {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  assessed_level: 'beginner' | 'intermediate' | 'advanced';
  teaching_method: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  total_days: number;
  start_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryContentItem extends GeneratedContent {
  progress_status: 'not_started' | 'in_progress' | 'completed' | null;
  quiz_score: number | null;
  last_studied_at: string | null;
  last_assessment_at: string | null;
  last_assessment_type: 'full' | 'wrong_only' | 'variant' | null;
  session_source: 'curriculum' | 'standalone';
  curriculum_id: string | null;
  curriculum_title: string | null;
  curriculum_day_number: number | null;
  curriculum_order_in_day: number | null;
  unresolved_wrong_count: number;
  unresolved_wrong_indexes: number[];
  needs_review: boolean;
  review_reason: string | null;
  review_score: number;
  review_level: 'urgent' | 'soon' | 'normal';
  review_factors: string[];
  days_since_created: number;
}

export interface CurriculumItem {
  id: string;
  curriculum_id: string;
  title: string;
  description: string | null;
  day_number: number;
  order_in_day: number;
  status: 'not_started' | 'in_progress' | 'completed';
  content_id: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface LevelAssessment {
  id: string;
  user_id: string;
  curriculum_id: string | null;
  goal: string;
  questions: AssessmentQuestion[];
  answers: AssessmentAnswer[];
  assessed_level: string | null;
  created_at: string;
}

export interface AssessmentQuestion {
  id: number;
  question: string;
  options: string[];
  correct_answer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  topic_area: string;
}

export interface AssessmentAnswer {
  question_id: number;
  selected: number;
  correct: boolean;
}

export interface CurriculumChat {
  id: string;
  curriculum_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface CurriculumWithItems extends UserCurriculum {
  items: CurriculumItem[];
}

export interface DaySchedule {
  day: number;
  date?: string;
  items: CurriculumItem[];
}

// ==========================================
// UI / Component Types
// ==========================================

export interface OnboardingFormData {
  goal: string;
  background: string;
  interests: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

// Topic with progress info for UI
export interface TopicWithProgress extends Topic {
  progress?: LearningProgress;
  content?: GeneratedContent;
}

export interface CourseWithTopics extends Course {
  topics: TopicWithProgress[];
}
