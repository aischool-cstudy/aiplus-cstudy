'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { ChatPanel } from './chat-panel';

interface TutorChatProps {
  curriculumId: string;
  curriculumGoal: string;
  contentTitle: string;
  contentBody: string;
  codeExamples: string;
  learnerLevel: string;
  language: string;
  teachingMethod?: string | null;
}

export function TutorChat({
  curriculumId,
  curriculumGoal,
  contentTitle,
  contentBody,
  codeExamples,
  learnerLevel,
  language,
  teachingMethod,
}: TutorChatProps) {
  const [open, setOpen] = useState(false);

  const context = {
    curriculumGoal,
    contentTitle,
    contentBody,
    codeExamples,
    learnerLevel,
    language,
    teachingMethod,
  };

  return (
    <>
      {/* 질문하기 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 px-4 py-3 bg-accent text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          aria-label="튜터에게 질문"
        >
          <HelpCircle className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-medium">질문하기</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 w-[calc(100vw-2rem)] sm:w-[380px] h-[min(70vh,520px)] sm:h-[520px]">
          <ChatPanel
            chatType="tutor"
            contextId={curriculumId}
            context={context}
            title="과정 튜터"
            placeholder="이 내용에 대해 질문하세요..."
            initialMessage={`"${contentTitle}" 학습 중이시군요! 이해가 안 되는 부분이나 궁금한 점이 있으면 편하게 물어보세요.`}
            onClose={() => setOpen(false)}
            className="h-full"
          />
        </div>
      )}
    </>
  );
}
