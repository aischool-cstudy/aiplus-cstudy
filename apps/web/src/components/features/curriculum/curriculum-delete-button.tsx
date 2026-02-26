'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteCurriculum } from '@/actions/curriculum';
import { Button } from '@/components/ui/button';

interface CurriculumDeleteButtonProps {
  curriculumId: string;
  className?: string;
}

export function CurriculumDeleteButton({ curriculumId, className = '' }: CurriculumDeleteButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const ok = window.confirm('이 커리큘럼을 삭제할까요? 관련 학습 항목도 함께 삭제됩니다.');
    if (!ok) return;

    startTransition(async () => {
      setError(null);
      const result = await deleteCurriculum(curriculumId);
      if (result?.error) {
        setError(`삭제 실패: ${result.error}`);
        return;
      }
      router.replace('/curriculum');
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="danger"
        size="sm"
        loading={pending}
        onClick={handleDelete}
      >
        <Trash2 className="w-4 h-4 mr-1" />
        삭제
      </Button>
      {error && (
        <p className="mt-2 text-xs text-error">{error}</p>
      )}
    </div>
  );
}
