export const ASSISTANT_PERSONA_VALUES = ['coach', 'mate'] as const;

export type AssistantPersona = (typeof ASSISTANT_PERSONA_VALUES)[number];

export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = 'coach';

export const ASSISTANT_PERSONA_OPTIONS: Array<{
  value: AssistantPersona;
  label: string;
  description: string;
}> = [
  {
    value: 'coach',
    label: '코치형',
    description: '목표 중심으로 명확한 기준과 실행을 이끕니다.',
  },
  {
    value: 'mate',
    label: '메이트형',
    description: '부드럽고 친근한 톤으로 지속 학습을 돕습니다.',
  },
];

export function isAssistantPersona(value: string | null | undefined): value is AssistantPersona {
  return Boolean(value && ASSISTANT_PERSONA_VALUES.includes(value as AssistantPersona));
}

export function normalizeAssistantPersona(value: string | null | undefined): AssistantPersona {
  return isAssistantPersona(value) ? value : DEFAULT_ASSISTANT_PERSONA;
}

export function getAssistantPersonaLabel(value: string | null | undefined): string {
  const normalized = normalizeAssistantPersona(value);
  const found = ASSISTANT_PERSONA_OPTIONS.find((option) => option.value === normalized);
  return found?.label || '코치형';
}
