import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MessageFeedbackProps {
  conversationId: string | null;
  messageContent: string;
  messageIndex: number;
}

export function MessageFeedback({ conversationId, messageContent, messageIndex }: MessageFeedbackProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);

  const submitFeedback = async (type: "positive" | "negative") => {
    if (feedback) return; // already submitted
    setFeedback(type);

    if (!conversationId) return;

    // Store feedback in the message's metadata by updating the matching message
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, metadata")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: true });

    if (msgs && msgs[messageIndex] !== undefined) {
      // Find the assistant message at this index
      const targetMsg = msgs[Math.floor(messageIndex / 2)]; // approximate mapping
      if (targetMsg) {
        const existingMeta = (targetMsg.metadata as Record<string, any>) || {};
        await supabase
          .from("messages")
          .update({ metadata: { ...existingMeta, feedback: type } })
          .eq("id", targetMsg.id);
      }
    }

    if (type === "negative") {
      toast.info("Feedback noted — Emma will adjust reasoning on future responses.");
    }
  };

  return (
    <div className="flex gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${feedback === "positive" ? "text-green-400" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => submitFeedback("positive")}
        disabled={feedback !== null}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${feedback === "negative" ? "text-red-400" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => submitFeedback("negative")}
        disabled={feedback !== null}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
