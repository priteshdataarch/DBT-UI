'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Copy,
  Check,
  FileCode,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { ChatMessage } from '@/types';

interface Props {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  onInsertCode: (code: string) => void;
  activeFilePath: string | null;
  activeFileContent?: string;
}

function CodeBlock({
  code,
  language,
  onInsert,
}: {
  code: string;
  language: string;
  onInsert: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2 rounded-md overflow-hidden border border-[#3e3e42]">
      <div className="flex items-center justify-between bg-[#2d2d2d] px-3 py-1.5">
        <span className="text-[10px] text-[#8b8b8b] font-mono">{language}</span>
        <div className="flex gap-3">
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[10px] text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors"
          >
            {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => onInsert(code)}
            className="flex items-center gap-1 text-[10px] text-[#569cd6] hover:text-[#79b8ff] transition-colors"
          >
            <FileCode size={11} />
            Insert
          </button>
        </div>
      </div>
      <pre className="p-3 bg-[#1a1a1a] text-xs text-[#d4d4d4] overflow-x-auto whitespace-pre font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function MessageContent({
  content,
  onInsert,
}: {
  content: string;
  onInsert: (code: string) => void;
}) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-sm text-[#d4d4d4] leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const body = part.slice(3, -3);
          const newline = body.indexOf('\n');
          const language = newline !== -1 ? body.slice(0, newline).trim() : '';
          const code = newline !== -1 ? body.slice(newline + 1).trim() : body.trim();
          return (
            <CodeBlock
              key={i}
              code={code}
              language={language || 'sql'}
              onInsert={onInsert}
            />
          );
        }
        // Render bold and inline code in plain text portions
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </div>
  );
}

const SUGGESTIONS = [
  'Create a staging model for raw_session',
  'Write a source YAML for a new database schema',
  'Add unique + not_null tests to f_score model',
  'Explain what ref() vs source() does in dbt',
  'Generate an incremental model for events data',
];

export default function ChatPanel({
  messages,
  onMessagesChange,
  onInsertCode,
  activeFilePath,
  activeFileContent,
}: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMsg];
    onMessagesChange(updatedMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          activeFilePath,
          activeFileContent,
        }),
      });

      const data = await res.json();
      onMessagesChange([
        ...updatedMessages,
        {
          role: 'assistant',
          content: data.message,
          sources: data.sources,
          timestamp: new Date(),
        },
      ]);
    } catch {
      onMessagesChange([
        ...updatedMessages,
        {
          role: 'assistant',
          content: '⚠️ Network error. Please check your connection and try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, activeFilePath, activeFileContent, onMessagesChange]);

  return (
    <div className="w-full h-full bg-[#252526] border-l border-[#3e3e42] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#3e3e42] shrink-0">
        <Sparkles size={14} className="text-[#007acc]" />
        <span className="text-[10px] font-semibold text-[#bdbdbd] uppercase tracking-widest">
          DBT Assistant
        </span>
        {activeFilePath && (
          <span
            className="ml-auto text-[10px] text-[#8b8b8b] truncate max-w-[140px]"
            title={activeFilePath}
          >
            {activeFilePath.split('/').pop()}
          </span>
        )}
        {messages.length > 0 && (
          <button
            onClick={() => onMessagesChange([])}
            className="text-[10px] text-[#5a5a5a] hover:text-[#8b8b8b] ml-1 shrink-0"
            title="Clear chat"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0 select-text">
        {messages.length === 0 && (
          <div className="text-center mt-6 px-2">
            <Bot size={28} className="mx-auto mb-3 text-[#007acc] opacity-40" />
            <p className="text-xs text-[#8b8b8b] mb-1">Ask me anything about dbt</p>
            <p className="text-[10px] text-[#5a5a5a] mb-4">
              I have context from your project files
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs px-3 py-2 bg-[#2d2d2d] hover:bg-[#3e3e42] rounded border border-[#3e3e42] text-[#8b8b8b] hover:text-[#d4d4d4] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                msg.role === 'user' ? 'bg-[#0e639c]' : 'bg-[#2d2d2d] border border-[#3e3e42]'
              }`}
            >
              {msg.role === 'user' ? (
                <User size={11} className="text-white" />
              ) : (
                <Bot size={11} className="text-[#007acc]" />
              )}
            </div>

            {/* Bubble */}
            <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              {msg.role === 'user' ? (
                <div className="inline-block px-3 py-2 bg-[#0e639c] rounded-lg text-sm text-white max-w-[280px] text-left break-words">
                  {msg.content}
                </div>
              ) : (
                <div className="bg-[#2d2d2d] rounded-lg p-3 border border-[#3e3e42]">
                  <MessageContent content={msg.content} onInsert={onInsertCode} />
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#3e3e42]">
                      <p className="text-[10px] text-[#5a5a5a] mb-1.5">Context from:</p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] bg-[#1e1e1e] text-[#569cd6] px-1.5 py-0.5 rounded border border-[#3e3e42]"
                            title={s}
                          >
                            {s.split('/').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-[#2d2d2d] border border-[#3e3e42] flex items-center justify-center shrink-0 mt-0.5">
              <Bot size={11} className="text-[#007acc]" />
            </div>
            <div className="bg-[#2d2d2d] rounded-lg px-3 py-2.5 border border-[#3e3e42]">
              <Loader2 size={14} className="text-[#8b8b8b] animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#3e3e42] shrink-0">
        <div className="flex gap-2 items-end bg-[#3c3c3c] rounded-lg px-3 py-2 border border-[#5a5a5a] focus-within:border-[#007acc] transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about dbt models, SQL, sources..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-[#d4d4d4] placeholder-[#5a5a5a] resize-none outline-none leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-1.5 bg-[#007acc] hover:bg-[#1177bb] active:bg-[#0d5a8e] disabled:opacity-30 disabled:cursor-not-allowed rounded text-white transition-colors shrink-0"
            title="Send (Enter)"
          >
            <Send size={13} />
          </button>
        </div>
        <p className="text-[10px] text-[#5a5a5a] mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
