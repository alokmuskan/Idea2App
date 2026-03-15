"use client";

import { useEffect, useRef, useState } from "react";

export default function Chat({ messages, onSend, isLoading }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || typeof onSend !== "function") return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <div className="panel flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div>
          <p className="pill">Conversation</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight">Builder chat</h2>
        </div>
        <span className="chip text-muted">Live</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white/60 p-6 text-sm text-muted">
            Ask for a product, a feature change, or a debug fix. The builder will plan first and then stream files.
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-soft ${
              message.role === "user"
                ? "ml-auto bg-ink text-white"
                : "bg-white/80 text-ink"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">
              {message.role === "user" ? "You" : "Builder"}
            </p>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border/70 px-5 py-4">
        <div className="flex flex-col gap-3">
          <textarea
            rows={3}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe the next change or idea..."
            className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm shadow-soft outline-none transition focus:border-accent"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Thinking..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
