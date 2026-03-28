import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { EmmaAvatar } from "./EmmaAvatar";
import type { Message } from "@/lib/emma-stream";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && <EmmaAvatar size="sm" />}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "emma-surface-elevated emma-glow-border rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-foreground [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-primary [&_pre]:bg-secondary [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_a]:text-primary [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_li]:text-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}
