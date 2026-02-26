'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl text-center">로그인</CardTitle>
        <CardDescription className="text-center">
          학습을 계속하려면 로그인하세요
        </CardDescription>
      </CardHeader>

      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-error/10 text-error text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

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
          placeholder="••••••••"
          required
        />

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          로그인
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        계정이 없으신가요?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">
          회원가입
        </Link>
      </p>
    </Card>
  );
}
