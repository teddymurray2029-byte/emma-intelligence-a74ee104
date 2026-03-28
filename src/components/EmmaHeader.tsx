import { EmmaAvatar } from "./EmmaAvatar";
import { motion } from "framer-motion";

export function EmmaHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 px-6 py-4 border-b border-border emma-surface"
    >
      <EmmaAvatar size="md" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold emma-glow-text font-mono">EMMA</h1>
          <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            UCA v2.0
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Unified Cognitive Architecture · AGI System
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-primary emma-pulse" />
        <span className="text-xs font-mono text-primary">ONLINE</span>
      </div>
    </motion.header>
  );
}
