'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { ChatPanel } from './chat-panel';

function isCurriculumLearnRoute(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 4 && parts[0] === 'curriculum' && parts[2] === 'learn';
}

export function ManagerChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hideOnThisPage = isCurriculumLearnRoute(pathname);

  if (hideOnThisPage) {
    return null;
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-primary text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="교육 매니저와 대화"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px]">
          <ChatPanel
            chatType="manager"
            title="교육관리 매니저"
            placeholder="무엇이든 물어보세요..."
            initialMessage="안녕하세요! 오늘도 함께 성장해봐요. 무엇을 도와드릴까요?"
            onClose={() => setOpen(false)}
            className="h-full"
          />
        </div>
      )}
    </>
  );
}
