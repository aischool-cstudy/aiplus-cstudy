'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Send, X, Loader2, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';

interface ChatPanelProps {
  chatType: 'manager' | 'tutor';
  contextId?: string;
  context?: Record<string, unknown>;
  title: string;
  placeholder?: string;
  initialMessage?: string;
  onClose?: () => void;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

function createMessage(role: 'assistant' | 'user', text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

export function ChatPanel({
  chatType,
  contextId,
  context,
  title,
  placeholder = '메시지를 입력하세요...',
  initialMessage,
  onClose,
  className = '',
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const initialMessages = useMemo(
    () => (initialMessage ? [createMessage('assistant', initialMessage)] : []),
    [initialMessage]
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextMessages = [...messages, createMessage('user', trimmed)];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatType,
          contextId,
          context: context || {},
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(`chat_failed:${res.status}`);
      }

      const data = await res.json() as { assistant?: string };
      const assistantText = (data.assistant || '').trim() || '답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.';
      setMessages((prev) => [...prev, createMessage('assistant', assistantText)]);
    } catch {
      setMessages((prev) => [
        ...prev,
        createMessage('assistant', '지금 답변을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.'),
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={`flex flex-col bg-background border border-border rounded-xl shadow-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
            chatType === 'manager' ? 'bg-primary/10' : 'bg-accent/10'
          }`}>
            <Bot className={`w-4 h-4 ${chatType === 'manager' ? 'text-primary' : 'text-accent'}`} />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                chatType === 'manager' ? 'bg-primary/10' : 'bg-accent/10'
              }`}>
                <Bot className={`w-3 h-3 ${chatType === 'manager' ? 'text-primary' : 'text-accent'}`} />
              </div>
            )}
            <div
              className={`max-w-[80%] p-3 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-muted rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <Markdown content={msg.text} className="prose-xs [&_p]:my-1 [&_pre]:my-1" />
              ) : (
                msg.text
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                <User className="w-3 h-3 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 items-start">
            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
              chatType === 'manager' ? 'bg-primary/10' : 'bg-accent/10'
            }`}>
              <Loader2 className={`w-3 h-3 animate-spin ${chatType === 'manager' ? 'text-primary' : 'text-accent'}`} />
            </div>
            <div className="bg-muted rounded-xl rounded-bl-sm p-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-3 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-muted border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="sm">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
