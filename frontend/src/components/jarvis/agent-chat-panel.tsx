"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bot, Send, X } from "lucide-react";
import Markdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { agentChat, type ChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contextType?: string;
  contextId?: string;
}

export function AgentChatPanel({ isOpen, onClose, contextType, contextId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      for await (const event of agentChat.streamChat(text, messages, contextType, contextId)) {
        if (event.type === "chunk" && event.content) {
          assistantContent += event.content;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
        if (event.type === "error") {
          assistantContent = event.content || "Something went wrong.";
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: assistantContent };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Failed to connect to Jarvis." };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, contextType, contextId]);

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
            <Bot className="size-3.5 text-primary" />
          </div>
          <h2 className="font-display text-sm font-semibold">Jarvis</h2>
          {streaming && (
            <span className="text-xs text-muted-foreground animate-pulse">thinking…</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close chat"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-6 text-primary" />
            </div>
            <p className="text-sm font-medium">Chat with Jarvis</p>
            <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
              Ask about companies, deals, memos, or anything else. Jarvis has context from the current page.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "assistant" && (
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-3.5 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1">
                  <Markdown>{msg.content || "…"}</Markdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask Jarvis…"
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="icon-sm"
            disabled={!input.trim() || streaming}
            onClick={sendMessage}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
