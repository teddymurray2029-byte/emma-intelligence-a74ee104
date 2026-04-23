import { motion } from "framer-motion";
import emmaLogo from "@/assets/emma-logo.png";

export function EmmaAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = { sm: 28, md: 36, lg: 56 };
  const s = dims[size];

  return (
    <div className="relative flex-shrink-0" style={{ width: s, height: s }}>
      <motion.div
        className="absolute inset-0 rounded-full emma-gradient-bg opacity-20 blur-md"
        animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <img
        src={emmaLogo}
        alt="Emma"
        className="relative rounded-full object-cover"
        style={{ width: s, height: s }}
      />
    </div>
  );
}
