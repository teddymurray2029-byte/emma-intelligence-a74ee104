import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EmmaHeader } from "@/components/EmmaHeader";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { TypingIndicator } from "@/components/TypingIndicator";
import { EmmaAvatar } from "@/components/EmmaAvatar";
import { streamChat, type Message } from "@/lib/emma-stream";
import { toast } from "sonner";

const WELCOME_SUGGESTIONS = [
  "What is your cognitive architecture?",
  "Explain the Free Energy Principle",
  "How do you handle reasoning?",
  "Tell me about your alignment system",
];

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const send = async (input: string) => {
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: allMessages,
        onDelta: upsertAssistant,
        onDone: () => setIsLoading(false),
        onError: (err) => {
          setIsLoading(false);
          toast.error(err);
        },
      });
    } catch {
      setIsLoading(false);
      toast.error("Failed to connect to Emma");
    }
  };

  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      <EmmaHeader />

      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="absolute inset-0 emma-scanline" />

        <AnimatePresence mode="wait">
          {showWelcome ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full px-6 py-12 gap-8"
            >
              <EmmaAvatar size="lg" />
              <div className="text-center space-y-3 max-w-lg">
                <h2 className="text-2xl font-bold emma-glow-text font-mono">
                  Hello, I'm Emma
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  An AGI system built on the Unified Cognitive Architecture — integrating
                  neurosymbolic reasoning, active inference, and constitutional alignment.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="emma-surface-elevated emma-glow-border rounded-xl px-4 py-3 text-xs text-secondary-foreground hover:bg-secondary transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto px-4 py-6 space-y-4"
            >
              {messages.map((m, i) => (
                <ChatMessage key={i} message={m} />
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3">
                  <EmmaAvatar size="sm" />
                  <TypingIndicator />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 py-4">
        <ChatInput onSend={send} disabled={isLoading} />
        <p className="text-[10px] text-center text-muted-foreground mt-2 font-mono">
          UCA v2.0 · Free Energy Principle · Constitutional Alignment
        </p>
      </div>
    </div>
  );
}
