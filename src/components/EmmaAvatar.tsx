import { motion } from "framer-motion";

export function EmmaAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: 32, md: 40, lg: 64 };
  const s = dims[size];

  return (
    <div className="relative flex-shrink-0" style={{ width: s, height: s }}>
      <motion.div
        className="absolute inset-0 rounded-full emma-gradient-bg opacity-20 blur-md"
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="relative rounded-full emma-gradient-bg flex items-center justify-center"
        style={{ width: s, height: s }}
      >
        <span
          className="font-mono font-bold text-primary-foreground"
          style={{ fontSize: s * 0.35 }}
        >
          E
        </span>
      </div>
    </div>
  );
}
