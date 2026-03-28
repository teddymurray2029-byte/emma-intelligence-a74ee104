import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { EmmaAvatar } from "./EmmaAvatar";
import { GitBranch, Download } from "lucide-react";
import { Button } from "./ui/button";
import type { Message } from "@/lib/emma-stream";

interface ChatMessageProps {
  message: Message;
  index?: number;
  onBranch?: (index: number) => void;
}

export function ChatMessage({ message, index, onBranch }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {!isUser && <EmmaAvatar size="sm" />}

      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={`rounded-2xl px-4 py-3 ${
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

        {/* Inline image */}
        {message.imageUrl && (
          <div className="relative rounded-xl overflow-hidden emma-glow-border">
            <img src={message.imageUrl} alt="Generated" className="max-w-full rounded-xl" />
            <a
              href={message.imageUrl}
              download="emma-generated.png"
              className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Download className="h-3.5 w-3.5 text-foreground" />
            </a>
          </div>
        )}

        {/* Branch button */}
        {onBranch && index !== undefined && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              onClick={() => onBranch(index)}
            >
              <GitBranch className="h-3 w-3" />
              Branch
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
