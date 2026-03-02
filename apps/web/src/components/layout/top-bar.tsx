'use client';

import { signOut } from '@/actions/auth';
import { LogOut, User } from 'lucide-react';

interface TopBarProps {
  title?: string;
  userName?: string;
}

export function TopBar({ title, userName }: TopBarProps) {
  return (
    <div className="hidden md:flex items-center justify-between px-8 h-16 border-b border-border bg-background">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>{userName || '사용자'}</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
