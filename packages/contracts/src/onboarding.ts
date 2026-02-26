export type OnboardingState = "collecting" | "confirming" | "completed";

export type SlotValue = string | number | string[];

export interface OnboardingSessionDto {
  session_id: string;
  state: OnboardingState;
  required_slots: string[];
  collected_slots: Record<string, SlotValue>;
  assistant_message: string;
}

export interface OnboardingTurnDto {
  assistant_message: string;
  state: OnboardingState;
  updated_slots: Record<string, SlotValue>;
  missing_slots: string[];
  confidence: number;
}

export interface OnboardingConfirmDto {
  success: boolean;
  learner_profile: {
    goal: string;
    level: "beginner" | "intermediate" | "advanced";
    weekly_study_hours: number;
    learning_style: "concept_first" | "problem_solving" | "project_building";
    preferred_teaching_method: "socratic" | "direct_instruction" | "problem_based" | "project_based";
    interests: string[];
  };
}
