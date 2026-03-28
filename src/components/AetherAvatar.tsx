import { motion } from "framer-motion";

export function AetherAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: 28, md: 36, lg: 56 };
  const s = dims[size];

  return (
    <div className="relative flex-shrink-0" style={{ width: s, height: s }}>
      <motion.div
        className="absolute inset-0 rounded-full aether-gradient-bg opacity-20 blur-md"
        animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="relative rounded-full aether-gradient-bg flex items-center justify-center"
        style={{ width: s, height: s }}
      >
        <span
          className="font-mono font-bold text-primary-foreground"
          style={{ fontSize: s * 0.32 }}
        >
          Æ
        </span>
      </div>
    </div>
  );
}
