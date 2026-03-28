import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className="emma-glow-border rounded-2xl emma-surface-elevated p-2 flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Ask Emma anything..."
        disabled={disabled}
        rows={1}
        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm resize-none outline-none px-3 py-2 max-h-40 font-sans"
      />
      <Button
        onClick={handleSubmit}
        disabled={disabled || !input.trim()}
        size="icon"
        variant="ghost"
        className="text-primary hover:bg-primary/10 rounded-xl flex-shrink-0 h-9 w-9"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
