import type {
  GenerateContentInput,
  AssessLevelInput,
  AnalyzeAnswersInput,
  GenerateCurriculumInput,
  RefineCurriculumInput,
  GenerateCurriculumContentInput,
} from './schemas';
import {
  getTeachingMethodGuideline,
  getTeachingMethodLabel,
} from './teaching-methods';

export function createContentPrompt(input: GenerateContentInput): string {
  const difficultyMap = {
    beginner: '초급 — 기본 개념과 간단한 예제 위주, 전문 용어 최소화',
    intermediate: '중급 — 핵심 개념 심화, 실용적 예제 포함',
    advanced: '고급 — 깊이 있는 개념, 최적화/설계 패턴, 실전 코드',
  };

  return `당신은 친절하고 체계적인 프로그래밍 교육 전문가입니다.

## 요청
다음 조건에 맞는 학습 콘텐츠를 생성해주세요.

- **프로그래밍 언어**: ${input.language}
- **주제**: ${input.topic}
- **난이도**: ${difficultyMap[input.difficulty]}
- **대상**: ${input.targetAudience}
- **설명 방식**: ${getTeachingMethodLabel(input.teachingMethod)} (${getTeachingMethodGuideline(input.teachingMethod)})

## 작성 규칙
1. **제목(title)**: 주제를 한눈에 알 수 있는 명확한 제목.
2. **본문(content)**: 마크다운 형식. 개념 설명 → 왜 중요한지 → 어떻게 사용하는지 순서.
   - 대상에 맞는 비유와 톤을 사용.
   - 설명 방식(${getTeachingMethodLabel(input.teachingMethod)}) 특성이 본문 흐름에 분명히 드러나야 함.
   - ${input.difficulty === 'beginner' ? '전문 용어에는 반드시 쉬운 설명을 붙일 것.' : ''}
3. **코드 예제(code_examples)**: 최소 1개, 최대 3개.
   - 각 예제에 제목, 코드, 설명 포함.
   - 실행 가능한 완전한 코드.
4. **퀴즈(quiz)**: 2~3문제.
   - 4지선다.
   - 정답 인덱스와 해설 포함.

JSON 형식으로 응답하세요.`;
}

// ==========================================
// Curriculum Prompts
// ==========================================

export function createAssessmentPrompt(input: AssessLevelInput): string {
  return `당신은 프로그래밍 교육 전문가이며 학습자의 실력을 정확하게 진단하는 역할을 합니다.

## 상황
학습자가 다음 목표를 가지고 있습니다: "${input.goal}"
${input.background ? `배경: ${input.background}` : ''}
${input.interests?.length ? `관심 분야: ${input.interests.join(', ')}` : ''}

## 요청
이 목표를 달성하기 위해 필요한 영역에서 학습자의 **현재 수준을 진단**할 수 있는 객관식 질문을 생성하세요.

## 규칙
1. 질문 수: 5~8개
2. 난이도 분포: easy 2~3개, medium 2~3개, hard 1~2개
3. 각 질문은 목표와 관련된 구체적인 프로그래밍 지식을 테스트
4. 4지선다, 정답 인덱스(0~3), 해당 질문이 어떤 영역을 테스트하는지(topic_area) 포함
5. 쉬운 질문은 기초 문법/개념, 어려운 질문은 설계/응용
6. JSON 외의 텍스트(설명 문장, 코드블록, 마크다운)를 절대 출력하지 마세요
7. difficulty는 반드시 소문자 문자열 "easy" | "medium" | "hard" 중 하나
8. id는 반드시 숫자(1부터 시작), 중복 없이 증가

반드시 아래 구조 그대로 응답:
{
  "questions": [
    {
      "id": 1,
      "question": "질문 내용",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
      "correct_answer": 0,
      "difficulty": "easy",
      "topic_area": "기초 문법"
    }
  ]
}`;
}

export function createAnalyzeAnswersPrompt(input: AnalyzeAnswersInput): string {
  const results = input.questions.map((q) => {
    const answer = input.answers.find(a => a.question_id === q.id);
    const isCorrect = answer?.selected === q.correct_answer;
    return `- [${isCorrect ? '정답' : '오답'}] (${q.difficulty}) ${q.topic_area}: ${q.question}`;
  }).join('\n');

  return `당신은 프로그래밍 교육 전문가입니다.

## 상황
학습자 목표: "${input.goal}"
진단 결과:
${results}

## 요청
위 진단 결과를 분석하여 학습자의 수준을 판정하세요.

## 규칙
- level: "beginner" | "intermediate" | "advanced"
- summary: 1~2문장으로 수준 요약
- strengths: 잘하는 영역 리스트
- weaknesses: 부족한 영역 리스트

JSON 형식으로 응답하세요.`;
}

export function createCurriculumPrompt(input: GenerateCurriculumInput): string {
  const targetTopicCount = input.level === 'beginner' ? '8~12개' : input.level === 'intermediate' ? '10~14개' : '12~16개';
  const goalTypeLabel: Record<string, string> = {
    job: '취업 준비',
    work: '실무 역량 강화',
    hobby: '취미/교양',
    project: '프로젝트 완성',
  };
  const learningStyleLabel: Record<string, string> = {
    concept_first: '개념→실습 순차형',
    problem_solving: '짧은 문제 반복형',
    project_building: '결과물 누적형',
  };

  return `당신은 체계적인 커리큘럼을 설계하는 프로그래밍 교육 전문가입니다.

## 학습자 정보
- 목표: ${input.goal}
- 현재 수준: ${input.level}
- 강점: ${input.strengths.length > 0 ? input.strengths.join(', ') : '아직 파악되지 않음'}
- 약점: ${input.weaknesses.length > 0 ? input.weaknesses.join(', ') : '아직 파악되지 않음'}
${input.background ? `- 배경: ${input.background}` : ''}
${input.interests?.length ? `- 관심 기술/언어: ${input.interests.join(', ')}` : ''}
- 목표 유형: ${goalTypeLabel[input.goalType || 'hobby'] || '일반 학습'}
- 주당 학습 가능 시간: ${input.weeklyStudyHours || 5}시간
- 선호 학습 스타일: ${learningStyleLabel[input.learningStyle || 'concept_first'] || '개념 우선형'}

## 요청
이 학습자가 목표를 달성하기 위한 **단계별 커리큘럼**을 설계하세요.

## 규칙
1. 커리큘럼 제목(title): 목표를 반영한 이름
2. 토픽 리스트(topics): 학습 순서대로 배열
   - 토픽 개수: ${targetTopicCount}
   - 각 토픽: title, description, estimated_minutes (예상 학습 시간, 분 단위)
   - description은 반드시 아래 3가지를 포함:
     1) 무엇을 배우는지
     2) 어떤 실습/산출물을 만드는지
     3) 완료 기준(검증 방법)
   - 약점 영역은 기초부터 시작, 강점 영역은 빠르게 넘어가기
   - 토픽 흐름은 선호 학습 스타일과 주당 학습 가능 시간에 맞게 난이도/분량을 조절
   - 실습/프로젝트 토픽을 최소 2개 이상 포함
   - 중복/유사 토픽(이름만 다른 같은 주제) 금지
   - 토픽 제목은 "기초", "심화" 같은 추상어만 단독으로 쓰지 말고 구체적으로 작성
3. total_estimated_hours: 전체 예상 시간 (시간 단위)
4. summary: 커리큘럼 설명 1~2문장

JSON 형식으로 응답하세요.`;
}

export function createRefineCurriculumPrompt(input: RefineCurriculumInput): string {
  const chatLog = input.chatHistory
    .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n');

  return `당신은 커리큘럼을 조정하는 교육 전문가입니다.

## 현재 커리큘럼
제목: ${input.currentCurriculum.title}
토픽 수: ${input.currentCurriculum.topics.length}개
토픽 목록:
${input.currentCurriculum.topics.map((t, i) => `${i + 1}. ${t.title} (${t.estimated_minutes}분) — ${t.description}`).join('\n')}

## 대화 기록
${chatLog}

## 사용자의 새 요청
${input.userMessage}

## 규칙
- 사용자의 요청에 맞게 커리큘럼을 수정하세요
- 토픽 추가/제거/순서 변경/내용 수정 가능
- 기존 구조(title, topics, total_estimated_hours, summary) 유지

JSON 형식으로 수정된 커리큘럼을 응답하세요.`;
}

// ==========================================
// v2 Phase 1: 교육적 추론 프롬프트
// ==========================================

export function createReasoningPrompt(input: GenerateCurriculumContentInput): string {
  const levelDesc: Record<string, string> = {
    beginner: '초보자',
    intermediate: '중급자',
    advanced: '고급자',
  };

  const prevContext = input.prevTopics.length > 0
    ? `이전 학습: ${input.prevTopics.join(', ')}`
    : '첫 번째 토픽';
  const nextContext = input.nextTopics.length > 0
    ? `다음 학습: ${input.nextTopics.join(', ')}`
    : '마지막 토픽';
  const feedbackSummary = input.learnerFeedback && input.learnerFeedback.length > 0
    ? `최근 학습 피드백: ${input.learnerFeedback
        .map((f, idx) => `${idx + 1}) 이해도 ${f.understanding_rating}/5, 어려웠던 개념: ${f.difficult_concepts.join(', ') || '없음'}`)
        .join(' | ')}`
    : '최근 학습 피드백 없음';
  const conceptFocusSummary = input.learnerConceptFocus && input.learnerConceptFocus.length > 0
    ? `취약/복습 우선 개념: ${input.learnerConceptFocus
        .map((c, idx) => `${idx + 1}) ${c.concept_tag} (숙련도 ${c.mastery_score}, 망각위험 ${c.forgetting_risk}, 자신감 ${c.confidence_score})`)
        .join(' | ')}`
    : '취약 개념 데이터 없음';

  return `당신은 프로그래밍 교육 설계 전문가입니다.

학습자 목표: ${input.curriculumGoal}
수준: ${levelDesc[input.learnerLevel] || input.learnerLevel}
언어: ${input.language}
설명 방식: ${getTeachingMethodLabel(input.teachingMethod)}
학습 스타일: ${input.learningStyle || 'concept_first'}
현재 토픽: ${input.topic} — ${input.topicDescription}
${prevContext} / ${nextContext}
${feedbackSummary}
${conceptFocusSummary}

이 토픽에 대한 교육적 분석을 해주세요:
- learning_objectives: 학습 후 달성 목표 (2~3개)
- prerequisite_concepts: 필요한 사전 지식
- why_this_topic: 학습자 목표에 이 토픽이 왜 중요한지
- teaching_strategy: 최적의 교수 전략
- difficulty_calibration: 수준별 난이도 조절
- connection_to_goal: 최종 목표와의 연결
- 취약 개념 데이터가 있으면, 해당 개념을 짧게 복습시키는 전략을 teaching_strategy에 반드시 포함

JSON으로 응답하세요.`;
}

// ==========================================
// v2 Phase 2: 섹션 기반 콘텐츠 프롬프트
// ==========================================

export function createSectionsPrompt(
  input: GenerateCurriculumContentInput,
  reasoning: {
    learning_objectives: string[];
    teaching_strategy: string;
    connection_to_goal: string;
  }
): string {
  return `당신은 프로그래밍 교육 콘텐츠 작성자입니다.

## 컨텍스트
- 토픽: ${input.topic}
- 목표: ${input.curriculumGoal}
- 수준: ${input.learnerLevel}
- 언어: ${input.language}
- 설명 방식: ${getTeachingMethodLabel(input.teachingMethod)}
- 학습 스타일: ${input.learningStyle || 'concept_first'}
- 취약 개념 우선순위: ${
    input.learnerConceptFocus && input.learnerConceptFocus.length > 0
      ? input.learnerConceptFocus.map((c) => `${c.concept_tag}(숙련도 ${c.mastery_score}, 망각위험 ${c.forgetting_risk})`).join(', ')
      : '없음'
  }
- 학습 목표: ${reasoning.learning_objectives.join(', ')}
- 교수 전략: ${reasoning.teaching_strategy}
- 목표 연결: ${reasoning.connection_to_goal}

## 작성할 섹션 (sections 배열)

각 섹션은 다음 필드를 **모두** 가집니다. 해당 섹션에서 사용하지 않는 필드는 빈 문자열("")이나 빈 배열([])이나 -1로 채우세요.

필드: type, title, body, code, explanation, question, options(문자열 배열), correct_answer(숫자), next_preview

### 섹션 순서:
1. type="motivation": body에 왜 배우는지 작성. 나머지 필드는 비워두기.
2. type="concept" (1~2개): title과 body에 핵심 개념 설명 (마크다운). 나머지 비워두기.
3. type="example" (1개): title, code에 실행 가능한 ${input.language} 코드, explanation에 설명. 나머지 비워두기.
4. type="check" (2~3개):
   - 각 check는 question, options(정확히 4개), correct_answer(0~3), explanation 필수
   - 최소 1개는 concept 섹션의 핵심 이해를 검증
   - 최소 1개는 example 코드/상황을 응용하는 문제로 구성
   - explanation에는 어떤 개념/예제와 연결되는지 근거를 명시
   - 선택지에는 정답과 함께 학습자가 흔히 하는 오해를 반영한 오답 포함
5. type="summary": body에 정리, next_preview에 다음 토픽 연결. 나머지 비워두기.

## 규칙
- 한국어
- 코드는 실행 가능해야 함
- 설명 방식(${getTeachingMethodLabel(input.teachingMethod)})에 맞춰 질문 톤과 피드백 스타일 반영
- 취약 개념 우선순위가 있으면 concept/check 섹션에서 최소 1회 이상 해당 개념을 보강
- 총 6~9개 섹션
- 비워두는 필드: 문자열은 "", 배열은 [], 숫자는 -1

JSON으로 응답하세요.`;
}
