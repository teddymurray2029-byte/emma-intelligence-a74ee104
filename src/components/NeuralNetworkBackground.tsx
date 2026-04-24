import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, Sparkles, Brain, Zap, Atom, Network } from "lucide-react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  pulsePhase: number;
  activation: number; // 0-1, decays over time
  layer: number;
}

interface Edge {
  a: number;
  b: number;
  weight: number;
  signalProgress: number; // -1 = inactive, 0..1 = traveling
  signalDirection: 1 | -1;
}

const IDEAS = [
  { icon: Lightbulb, text: "Hypothesizing emergent compositional generalization in latent space..." },
  { icon: Brain, text: "Cross-referencing 14,392 sources on quantum decoherence." },
  { icon: Sparkles, text: "Discovered novel pattern: recursive self-attention improves planning by 23%." },
  { icon: Atom, text: "Simulating molecular dynamics for catalyst candidate #4471." },
  { icon: Network, text: "Forming new association: economics ↔ thermodynamics." },
  { icon: Zap, text: "Activating chain-of-thought: 7-step plan synthesized." },
  { icon: Brain, text: "Memory consolidation: 1,204 episodes integrated." },
  { icon: Lightbulb, text: "Insight: causal model predicts user intent with 0.94 confidence." },
  { icon: Sparkles, text: "Generating counterfactual reasoning trace..." },
  { icon: Atom, text: "Refactoring world model — version 47 stable." },
  { icon: Network, text: "Edge weights re-balanced across 3.2M synapses." },
  { icon: Zap, text: "Reasoning depth: 12 → 18. Confidence rising." },
];

interface IdeaBubble {
  id: number;
  text: string;
  Icon: typeof Lightbulb;
  x: number; // % of container
  y: number;
}

export function NeuralNetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const rafRef = useRef<number>(0);
  const [bubbles, setBubbles] = useState<IdeaBubble[]>([]);

  // Init network
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildNetwork(width, height);
    };

    const buildNetwork = (w: number, h: number) => {
      // Layered network: 4 layers
      const layers = [5, 8, 8, 5];
      const nodes: Node[] = [];
      const padX = w * 0.12;
      const usableW = w - padX * 2;
      layers.forEach((count, layerIdx) => {
        const x = padX + (usableW * layerIdx) / (layers.length - 1);
        for (let i = 0; i < count; i++) {
          const y = (h * (i + 1)) / (count + 1);
          nodes.push({
            x: x + (Math.random() - 0.5) * 30,
            y: y + (Math.random() - 0.5) * 30,
            vx: (Math.random() - 0.5) * 0.08,
            vy: (Math.random() - 0.5) * 0.08,
            radius: 2.5 + Math.random() * 2,
            baseAlpha: 0.3 + Math.random() * 0.3,
            pulsePhase: Math.random() * Math.PI * 2,
            activation: 0,
            layer: layerIdx,
          });
        }
      });

      // Edges between adjacent layers, sparse
      const edges: Edge[] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[j].layer === nodes[i].layer + 1 && Math.random() < 0.55) {
            edges.push({
              a: i,
              b: j,
              weight: 0.15 + Math.random() * 0.5,
              signalProgress: -1,
              signalDirection: 1,
            });
          }
        }
      }
      nodesRef.current = nodes;
      edgesRef.current = edges;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let lastSignal = 0;

    const tick = (t: number) => {
      const { width: w, height: h } = container.getBoundingClientRect();
      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // Periodically fire a forward propagation from input layer
      if (t - lastSignal > 700 + Math.random() * 800) {
        lastSignal = t;
        const inputs = nodes.map((n, i) => ({ n, i })).filter((x) => x.n.layer === 0);
        const seed = inputs[Math.floor(Math.random() * inputs.length)];
        if (seed) seed.n.activation = 1;
      }

      // Update node positions (slow drift)
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 20 || n.x > w - 20) n.vx *= -1;
        if (n.y < 20 || n.y > h - 20) n.vy *= -1;
        n.activation *= 0.97; // decay
      });

      // Edges
      edges.forEach((e) => {
        const a = nodes[e.a];
        const b = nodes[e.b];
        if (!a || !b) return;

        // Trigger signal travel when source is highly activated
        if (e.signalProgress < 0 && a.activation > 0.6 && Math.random() < 0.18) {
          e.signalProgress = 0;
        }

        const baseAlpha = 0.05 + e.weight * 0.08;
        ctx.strokeStyle = `hsla(217, 95%, 62%, ${baseAlpha})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Signal pulse
        if (e.signalProgress >= 0) {
          e.signalProgress += 0.025;
          const p = e.signalProgress;
          const sx = a.x + (b.x - a.x) * p;
          const sy = a.y + (b.y - a.y) * p;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
          grad.addColorStop(0, "hsla(190, 100%, 70%, 0.9)");
          grad.addColorStop(0.4, "hsla(217, 100%, 65%, 0.45)");
          grad.addColorStop(1, "hsla(217, 100%, 65%, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, 14, 0, Math.PI * 2);
          ctx.fill();

          // Bright glowing line segment behind signal
          const tail = Math.max(0, p - 0.25);
          const tx = a.x + (b.x - a.x) * tail;
          const ty = a.y + (b.y - a.y) * tail;
          const lineGrad = ctx.createLinearGradient(tx, ty, sx, sy);
          lineGrad.addColorStop(0, "hsla(217, 95%, 62%, 0)");
          lineGrad.addColorStop(1, "hsla(190, 100%, 75%, 0.85)");
          ctx.strokeStyle = lineGrad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(sx, sy);
          ctx.stroke();

          if (p >= 1) {
            e.signalProgress = -1;
            // activate target
            b.activation = Math.min(1, b.activation + 0.7 * e.weight + 0.3);
          }
        }
      });

      // Nodes
      nodes.forEach((n) => {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.0015 + n.pulsePhase);
        const activation = n.activation;
        const alpha = Math.min(1, n.baseAlpha + pulse * 0.25 + activation * 0.7);
        const r = n.radius + activation * 4 + pulse * 0.6;

        // Outer glow
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4 + activation * 14);
        const hue = activation > 0.3 ? 190 : 217;
        glow.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.35 + activation * 0.45})`);
        glow.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4 + activation * 14, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `hsla(${hue}, 100%, ${75 + activation * 15}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // Floating idea bubbles
  useEffect(() => {
    let id = 0;
    const spawn = () => {
      const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
      const newBubble: IdeaBubble = {
        id: id++,
        text: idea.text,
        Icon: idea.icon,
        x: 8 + Math.random() * 70, // keep away from far right
        y: 12 + Math.random() * 70,
      };
      setBubbles((prev) => [...prev.slice(-3), newBubble]);
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b.id !== newBubble.id));
      }, 5500);
    };

    spawn();
    const interval = setInterval(spawn, 2600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <AnimatePresence>
        {bubbles.map((b) => {
          const Icon = b.Icon;
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 12, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="absolute max-w-[260px]"
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
            >
              <div className="emma-glass rounded-xl px-3 py-2 flex items-start gap-2 shadow-[0_8px_24px_-8px_hsl(217_95%_62%/0.4)] border border-primary/20">
                <div className="mt-0.5 p-1 rounded-md bg-primary/15 border border-primary/30">
                  <Icon className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[8px] font-mono uppercase tracking-wider text-primary/80 mb-0.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emma-cyan animate-pulse" />
                    Emma · idea
                  </div>
                  <p className="text-[10px] leading-snug text-foreground/90">{b.text}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
