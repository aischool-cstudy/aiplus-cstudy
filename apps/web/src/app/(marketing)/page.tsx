import Link from 'next/link';
import {
  Sparkles,
  Target,
  ArrowRight,
  CheckCircle2,
  Brain,
  CalendarDays,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-5">
            <Sparkles className="w-4 h-4" />
            AI 기반 개인 맞춤 학습 운영
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight max-w-4xl mx-auto">
            목표를 끝까지 완주하게 만드는
            <br />
            <span className="text-primary">개인화 코딩 학습 매니저</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-5 max-w-3xl mx-auto">
            목표/수준/시간을 먼저 파악하고, 오늘 해야 할 학습을 자동으로 배치합니다.
            학습 기록과 피드백을 반영해 다음 콘텐츠까지 이어집니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl text-base font-semibold hover:bg-primary-dark transition-colors"
            >
              시작하기
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              로그인
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-10 text-left">
            {[
              { title: '3분 온보딩', desc: '닉네임·목표·시간만 입력하면 시작' },
              { title: '자동 커리큘럼', desc: '수준 진단 기반으로 학습 순서 제안' },
              { title: '학습 환류', desc: '진행 기록을 다음 콘텐츠에 반영' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-16 bg-muted/40 border-y border-border">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">학습 흐름은 간단합니다</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: '1',
                icon: Target,
                title: '목표 설정',
                desc: '목표와 학습 제약(시간/수준)을 입력합니다.',
              },
              {
                step: '2',
                icon: Brain,
                title: 'AI 진단·설계',
                desc: '진단 결과로 커리큘럼과 학습 콘텐츠를 구성합니다.',
              },
              {
                step: '3',
                icon: CalendarDays,
                title: '오늘 학습 실행',
                desc: '오늘 해야 할 토픽부터 진행하고 기록이 자동 반영됩니다.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 text-sm text-primary font-semibold mb-3">
                    <span className="w-6 h-6 rounded-full bg-primary text-white inline-flex items-center justify-center text-xs">
                      {item.step}
                    </span>
                    STEP {item.step}
                  </div>
                  <Icon className="w-6 h-6 text-primary mb-3" />
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Value bullets */}
      <section className="py-14">
        <div className="max-w-5xl mx-auto px-4">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {[
                '커리큘럼/문제 훈련/학습 기록이 하나의 흐름으로 연결됩니다.',
                '온보딩에서 설정한 설명 방식과 학습 스타일이 생성 품질에 반영됩니다.',
                '학습 완료 후 다음 토픽으로 자연스럽게 이어지는 구조를 제공합니다.',
                '설정 화면에서 목표·설명 방식·학습 스타일을 언제든 수정할 수 있습니다.',
              ].map((text) => (
                <div key={text} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
