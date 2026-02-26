'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className}`}>
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
            return <p className="my-2 leading-relaxed">{children}</p>;
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
