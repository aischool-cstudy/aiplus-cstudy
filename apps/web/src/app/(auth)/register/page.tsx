'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signUp } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signUp(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-center">회원가입</CardTitle>
        <CardDescription className="text-center">
          AI+ 교육 플랫폼에 가입하세요
        </CardDescription>
      </CardHeader>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-error/10 text-error text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <Input
          id="name"
          name="name"
          type="text"
          label="이름"
          placeholder="홍길동"
          required
        />

        <Input
          id="email"
          name="email"
          type="email"
          label="이메일"
          placeholder="you@example.com"
          required
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="비밀번호"
          placeholder="8자 이상 입력하세요"
          minLength={8}
          required
        />

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          회원가입
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          로그인
        </Link>
      </p>
    </Card>
  );
}
