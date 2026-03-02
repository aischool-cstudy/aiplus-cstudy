export function createAIGenerationTraceId(pipeline: string): string {
  const safePipeline = String(pipeline || 'ai').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safePipeline}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
