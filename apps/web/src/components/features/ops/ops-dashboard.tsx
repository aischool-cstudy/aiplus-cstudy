'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AIOpsMetrics } from '@/actions/analytics';

interface OpsDashboardProps {
  metrics: AIOpsMetrics;
}

const numberFormatter = new Intl.NumberFormat('ko-KR');

function latencyLabel(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function numberLabel(value: number) {
  return numberFormatter.format(Math.max(0, Math.round(value)));
}

function usdLabel(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function OpsDashboard({ metrics }: OpsDashboardProps) {
  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">AI 운영 지표</h2>
        <p className="text-sm text-muted-foreground mt-1">
          최근 {metrics.days}일 기준 생성 안정성, 추천 전환, 평가 재도전 흐름을 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{numberLabel(metrics.totalRuns)}</p>
            <p className="text-xs text-muted-foreground">총 AI 실행(run)</p>
            <p className="text-xs text-muted-foreground mt-1">
              진행중 {numberLabel(metrics.runningRuns)} / 완료 {numberLabel(metrics.completedRuns)} / 중단 {numberLabel(metrics.abandonedRuns)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">
              {metrics.usage.costEstimatedRuns > 0 ? usdLabel(metrics.usage.totalEstimatedCostUsd) : '-'}
            </p>
            <p className="text-xs text-muted-foreground">총 예상 비용</p>
            <p className="text-xs text-muted-foreground mt-1">
              비용 추정 {numberLabel(metrics.usage.costEstimatedRuns)} run / 평균 {metrics.usage.costEstimatedRuns > 0 ? usdLabel(metrics.usage.avgEstimatedCostUsdPerEstimatedRun) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">
              {metrics.usage.meteredRuns > 0 ? numberLabel(metrics.usage.totalTokens) : '-'}
            </p>
            <p className="text-xs text-muted-foreground">총 토큰</p>
            <p className="text-xs text-muted-foreground mt-1">
              입력 {numberLabel(metrics.usage.totalInputTokens)} / 출력 {numberLabel(metrics.usage.totalOutputTokens)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.failureRate}%</p>
            <p className="text-xs text-muted-foreground">실패율 (running 제외)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{latencyLabel(metrics.avgLatencyMs)}</p>
            <p className="text-xs text-muted-foreground">평균 지연</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{numberLabel(metrics.recommendation.totalEvents)}</p>
            <p className="text-xs text-muted-foreground">추천 이벤트 수</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{numberLabel(metrics.retries.retriedRuns)}</p>
            <p className="text-xs text-muted-foreground">
              재시도 발생 ({metrics.retries.retriedRate}% / 종결 run 기준)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              평균 시도 {metrics.retries.avgAttemptCount}회
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{numberLabel(metrics.reliability.fallbackRuns)}</p>
            <p className="text-xs text-muted-foreground">
              폴백 발생 ({metrics.reliability.fallbackRate}% / 종결 run 기준)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.reliability.timeoutOrRateLimitedRate}%</p>
            <p className="text-xs text-muted-foreground">
              timeout/429 비율 (원인 식별 실패 중)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              timeout {metrics.reliability.timeoutFailures} / 429 {metrics.reliability.rateLimitedFailures}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">파이프라인 안정성</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.pipelines.length === 0 ? (
              <p className="text-sm text-muted-foreground">수집된 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {metrics.pipelines.map((pipeline) => (
                  <div key={pipeline.pipeline} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{pipeline.pipeline}</p>
                      <Badge variant={pipeline.failureRate >= 15 ? 'warning' : 'success'}>
                        실패율 {pipeline.failureRate}%
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>실행 {numberLabel(pipeline.total)}</span>
                      <span>진행중 {numberLabel(pipeline.running)}</span>
                      <span>완료 {numberLabel(pipeline.completed)}</span>
                      <span>실패 {numberLabel(pipeline.failed)}</span>
                      <span>중단 {numberLabel(pipeline.abandoned)}</span>
                      <span>평균 {latencyLabel(pipeline.avgLatencyMs)}</span>
                      <span>토큰 {numberLabel(pipeline.totalTokens)}</span>
                      <span>비용 {pipeline.costEstimatedRuns > 0 ? usdLabel(pipeline.totalEstimatedCostUsd) : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">주요 실패 코드</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.errorCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">실패 로그가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {metrics.errorCodes.slice(0, 8).map((error) => (
                  <div key={error.errorCode} className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2">
                    <span className="font-mono text-xs">{error.errorCode}</span>
                    <Badge variant="warning">{error.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">모델 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.providerModels.length === 0 ? (
              <p className="text-sm text-muted-foreground">수집된 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {metrics.providerModels.map((metric) => (
                  <div key={`${metric.provider}:${metric.model}`} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{metric.provider}</p>
                      <Badge variant={metric.failureRate >= 15 ? 'warning' : 'success'}>
                        실패율 {metric.failureRate}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{metric.model}</p>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>실행 {numberLabel(metric.total)}</span>
                      <span>진행중 {numberLabel(metric.running)}</span>
                      <span>완료 {numberLabel(metric.completed)}</span>
                      <span>실패 {numberLabel(metric.failed)}</span>
                      <span>중단 {numberLabel(metric.abandoned)}</span>
                      <span>평균 {latencyLabel(metric.avgLatencyMs)}</span>
                      <span>토큰 {numberLabel(metric.totalTokens)}</span>
                      <span>비용 {metric.costEstimatedRuns > 0 ? usdLabel(metric.totalEstimatedCostUsd) : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">추천 전환 퍼널</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recommendation.bySurface.length === 0 ? (
              <p className="text-sm text-muted-foreground">추천 이벤트가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {metrics.recommendation.bySurface.map((surface) => (
                  <div key={surface.surface} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{surface.surface}</p>
                      <Badge>{surface.clickThroughRate}% CTR</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                      <span>노출 {surface.impressions}</span>
                      <span>클릭 {surface.clicks}</span>
                      <span>시작 {surface.starts}</span>
                      <span>완료 {surface.completes}</span>
                      <span>완료율 {surface.completionRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">평가 재도전 지표</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">총 평가 시도</p>
                <p className="text-xl font-semibold">{numberLabel(metrics.assessment.totalAttempts)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">평균 점수</p>
                <p className="text-xl font-semibold">{metrics.assessment.avgScore}점</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">오답 재도전 / 변형 문제 시도</p>
                <p className="text-sm font-medium">
                  {metrics.assessment.wrongOnlyAttempts}회 / {metrics.assessment.variantAttempts}회
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
