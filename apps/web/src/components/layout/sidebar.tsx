'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Sparkles,
  Clock,
  RotateCcw,
  Settings,
  GraduationCap,
  Target,
  BarChart3,
} from 'lucide-react';

const navItems = [
  { label: '대시보드', href: '/dashboard', icon: LayoutDashboard },
  { label: '커리큘럼', href: '/curriculum', icon: Target },
  { label: '문제 훈련', href: '/generate', icon: Sparkles },
  { label: '기록', href: '/history', icon: Clock },
  { label: '복습 세션', href: '/review', icon: RotateCcw },
  { label: '운영 지표(관리자)', href: '/ops', icon: BarChart3 },
  { label: '설정', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 bg-sidebar border-r border-border h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold">AI+</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border">
        <div className="bg-primary/5 rounded-lg p-3">
          <p className="text-xs font-medium text-primary">Free Plan</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI 문제 생성 기능을 사용해보세요
          </p>
        </div>
      </div>
    </aside>
  );
}
