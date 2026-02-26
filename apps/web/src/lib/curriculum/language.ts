const LANGUAGE_KEYWORD_MAP: Record<string, string[]> = {
  Python: ['python', '파이썬', 'ai', '챗봇', '데이터', '머신러닝', '딥러닝', 'django', 'flask'],
  JavaScript: ['javascript', '자바스크립트', 'react', 'next', 'node', '웹', 'frontend', '프론트엔드'],
  TypeScript: ['typescript', '타입스크립트'],
  Java: ['java', '자바', 'spring', '안드로이드', 'android'],
  'C++': ['c++', '알고리즘', '자료구조', '코딩테스트'],
  Swift: ['swift', 'ios', '아이폰'],
  Kotlin: ['kotlin', '코틀린'],
};

export function inferLanguageFromGoalAndInterests(goal: string, interests: string[]): string {
  const text = `${goal} ${interests.join(' ')}`.toLowerCase();
  for (const [language, keywords] of Object.entries(LANGUAGE_KEYWORD_MAP)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return language;
    }
  }
  return 'Python';
}
