'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

function hasStructuredMarkdown(content: string): boolean {
  return /```|(^|\n)\s*(#|[-*+]\s|\d+\.\s|>|\|)/m.test(content) || content.includes('\n\n');
}

function improvePlainTextReadability(content: string): string {
  const trimmed = content.trim();
  if (!trimmed || hasStructuredMarkdown(trimmed)) return trimmed;

  // 번호 목록(1. 2. 3.)은 줄 분리해 가독성을 높인다.
  const withListBreaks = trimmed.replace(/([^\n])\s+(?=\d+\.\s)/g, '$1\n');
  if (withListBreaks.length < 220) return withListBreaks;

  // 너무 긴 단일 문단은 2문장 단위 문단으로 자동 분리한다.
  const sentences = withListBreaks
    .split(/(?<=[^0-9][.!?])\s+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (sentences.length < 4) return withListBreaks;

  const paragraphs: string[] = [];
  for (let idx = 0; idx < sentences.length; idx += 2) {
    paragraphs.push(sentences.slice(idx, idx + 2).join(' '));
  }
  return paragraphs.join('\n\n');
}

export function Markdown({ content, className = '' }: MarkdownProps) {
  const formatted = improvePlainTextReadability(content);

  return (
    <div className={`prose prose-sm md:prose-base max-w-none dark:prose-invert text-foreground/90 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 코드 블록
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            
            return (
              <code className={`block bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          // pre 태그
          pre({ children }) {
            return (
              <pre className="bg-muted rounded-lg overflow-x-auto my-3 p-0">
                {children}
              </pre>
            );
          },
          // 헤딩
          h1({ children }) {
            return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>;
          },
          // 리스트
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>;
          },
          // 단락
          p({ children }) {
            return <p className="my-3 leading-7 md:leading-8">{children}</p>;
          },
          // 강조
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          // 블록 인용
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-primary/30 pl-4 my-3 text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },
          // 테이블
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border border-border rounded-lg">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="bg-muted px-3 py-2 text-left text-sm font-medium border-b border-border">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 text-sm border-b border-border">{children}</td>;
          },
        }}
      >
        {formatted}
      </ReactMarkdown>
    </div>
  );
}
