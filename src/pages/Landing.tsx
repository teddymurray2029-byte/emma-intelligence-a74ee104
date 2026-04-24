import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useState, useRef, MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { EmmaAvatar } from "@/components/EmmaAvatar";
import { PaywallModal } from "@/components/PaywallModal";
import { useAuth } from "@/hooks/useAuth";
import {
  Brain, Search, Hammer, Mic, BarChart3, Code2, Image as ImageIcon, Eye,
  Cpu, Shield, Zap, Network, GitBranch, Database, Sparkles, ArrowRight,
  CheckCircle2, Infinity as InfinityIcon, Lock, Globe, Workflow, Bot, Layers,
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "AGI Reasoning Core", desc: "Multi-step planning, world-model simulation, causal inference, and metacognitive self-correction.", color: "from-blue-500 to-purple-500" },
  { icon: Search, title: "Deep Research", desc: "Live web search, source-grounded synthesis, and citation-backed reports across any domain.", color: "from-cyan-500 to-blue-500" },
  { icon: Hammer, title: "Build Mode", desc: "Generates full React components, landing pages, and apps with live preview and code export.", color: "from-amber-500 to-orange-500" },
  { icon: Code2, title: "Code Execution", desc: "Sandboxed Python & JS execution via E2B — analyze data, run scripts, return verified results.", color: "from-emerald-500 to-teal-500" },
  { icon: Mic, title: "Voice Conversations", desc: "Real-time voice in/out via ElevenLabs — talk to Emma like a human collaborator.", color: "from-pink-500 to-rose-500" },
  { icon: BarChart3, title: "Data Analysis", desc: "Upload CSV/JSON/Excel — Emma profiles, visualizes, and writes insights automatically.", color: "from-violet-500 to-fuchsia-500" },
  { icon: ImageIcon, title: "Image Generation", desc: "Gemini 3 Pro Image and nano-banana models for hero art, logos, edits, and product shots.", color: "from-yellow-500 to-amber-500" },
  { icon: Eye, title: "Computer Use Agent", desc: "Emma can see and operate browsers — fill forms, scrape, navigate apps autonomously.", color: "from-red-500 to-pink-500" },
  { icon: Network, title: "Multi-Agent Swarm", desc: "Spawns specialist sub-agents (researcher, coder, critic) that collaborate on hard tasks.", color: "from-indigo-500 to-blue-500" },
  { icon: GitBranch, title: "GitHub Integration", desc: "Auto-commits self-improvements to your repo, runs CI, opens PRs against itself.", color: "from-slate-500 to-zinc-500" },
  { icon: Database, title: "Persistent Memory", desc: "Episodic + semantic memory with vector recall — remembers every conversation forever.", color: "from-green-500 to-emerald-500" },
  { icon: Shield, title: "Formal Safety Layer", desc: "CVSS-scored risk gates, adversarial red-teaming, and provable constraint enforcement.", color: "from-blue-600 to-indigo-600" },
  { icon: Workflow, title: "Autonomous Loops", desc: "Goals decompose into sub-goals, executed every 15 min. Benchmarks gate self-modifications.", color: "from-purple-500 to-violet-500" },
  { icon: Cpu, title: "Self-Improvement", desc: "Measures own performance, rewrites its prompts and edge functions, redeploys autonomously.", color: "from-orange-500 to-red-500" },
  { icon: Bot, title: "Project IDE", desc: "Inline Monaco editor, file explorer, terminal — Emma codes alongside you in real-time.", color: "from-teal-500 to-cyan-500" },
  { icon: Layers, title: "Cross-Domain Transfer", desc: "Knowledge learned in one domain transfers to others via embedding-grounded analogy.", color: "from-fuchsia-500 to-pink-500" },
];

const MODES = [
  { name: "Chat", path: "/app?mode=chat", icon: Brain, blurb: "Ask anything. Get reasoned, sourced, structured answers." },
  { name: "Research", path: "/app?mode=research", icon: Search, blurb: "Multi-source web research with citations and synthesis." },
  { name: "Build", path: "/app?mode=artifacts", icon: Hammer, blurb: "Generate React components and full pages with live preview." },
  { name: "Voice", path: "/app?mode=voice", icon: Mic, blurb: "Real-time spoken conversation, hands-free." },
  { name: "Data", path: "/app?mode=data", icon: BarChart3, blurb: "Upload data → automatic analysis, charts, and insight reports." },
  { name: "Code IDE", path: "/app?mode=ide", icon: Code2, blurb: "Full project workspace with editor, files, and execution." },
  { name: "Computer Use", path: "/app?mode=computer", icon: Eye, blurb: "Emma operates a real browser to complete tasks for you." },
  { name: "AGI Dashboard", path: "/agi", icon: Cpu, blurb: "Live readout of reasoning, safety, and self-improvement loops." },
];

const FAQ = [
  { q: "What does the membership include?", a: "Unlimited messages across every mode — chat, research, build, voice, data, code execution, computer use, image generation. No per-message caps, no overage fees. One flat price: $12/month." },
  { q: "How does Emma differ from ChatGPT or Claude?", a: "Emma is an autonomous AGI system, not a chatbot. She runs a self-improvement loop every 15 minutes, benchmarks herself, modifies her own prompts and edge functions, and commits the diffs to GitHub. She also has a formal safety verifier and a multi-agent swarm." },
  { q: "Is my data private?", a: "Yes. Each user's conversations, memory, projects, and files are isolated by row-level security. Emma never trains on your data." },
  { q: "How do I pay?", a: "Send $12 via Cash App to $mycashdirect2022 each month. Include the unique reference code shown at checkout in the payment note. Access unlocks instantly." },
  { q: "Can I cancel?", a: "Yes — cancel anytime by simply not renewing the next month. No contracts, no auto-charges. You're always in control." },
];

/* --- Tilt + spotlight card --- */
function TiltCard({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 200, damping: 20 });
  const sx = useMotionValue(50);
  const sy = useMotionValue(50);

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px - 0.5);
    my.set(py - 0.5);
    sx.set(px * 100);
    sy.set(py * 100);
  }
  function handleLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" as const, transformPerspective: 1000 }}
      className={`group relative ${className}`}
    >
      {/* Spotlight */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: useTransform(
            [sx, sy],
            ([x, y]) => `radial-gradient(380px circle at ${x}% ${y}%, hsl(var(--primary) / 0.18), transparent 55%)`,
          ) as any,
        }}
      />
      {children}
      <span className="emma-glare" />
    </motion.div>
  );
}

export default function Landing() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const goApp = () => navigate(user ? "/app" : "/sign-up");

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
      {/* Ambient background — layered */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Conic glow */}
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[1200px] h-[1200px] opacity-40">
          <div className="emma-conic-glow w-full h-full rounded-full" />
        </div>
        {/* Soft color blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 w-[800px] h-[800px] rounded-full bg-purple-500/8 blur-[140px]" />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 80%)",
          }}
        />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_95%)]" />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-background/50 border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/40 blur-md group-hover:blur-lg transition-all" />
              <EmmaAvatar size="sm" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Emma <span className="text-muted-foreground font-light">Intelligence</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <a href="#modes" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors">Modes</a>
            <a href="#features" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors">Features</a>
            <a href="#pricing" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors">Pricing</a>
            {user ? (
              <Button onClick={() => navigate("/app")} size="sm" className="ml-2 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.5)]">
                Open App<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <>
                <Link to="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Button onClick={goApp} size="sm" className="ml-1 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.5)]">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-6 pt-24 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-primary mb-10 emma-glass overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Autonomous AGI · Self-Improving · Live Now
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl sm:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.02] max-w-5xl mx-auto"
          style={{ textShadow: "0 0 80px hsl(var(--primary) / 0.15)" }}
        >
          The first AI that{" "}
          <span className="emma-glow-text relative inline-block">
            improves itself
            <motion.span
              aria-hidden
              className="absolute -inset-x-2 -inset-y-1 -z-10 rounded-2xl bg-primary/10 blur-2xl"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          </span>
          <br />
          <span className="text-foreground/85">while it works for you.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
        >
          Emma is an autonomous AGI system — research, build, code, analyze, speak, and operate computers.
          She rewrites her own prompts, benchmarks herself, and ships improvements to GitHub every 15 minutes.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <Button
            onClick={goApp}
            size="lg"
            className="relative h-14 px-8 text-base font-semibold group overflow-hidden shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6),0_0_0_1px_hsl(0_0%_100%/0.06)_inset] hover:shadow-[0_16px_50px_-10px_hsl(var(--primary)/0.8),0_0_0_1px_hsl(0_0%_100%/0.1)_inset] transition-shadow"
          >
            <span className="relative z-10 flex items-center">
              Try Emma Free
              <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </Button>
          <Button
            onClick={() => setPaywallOpen(true)}
            size="lg"
            variant="outline"
            className="h-14 px-8 text-base font-semibold emma-glass border-white/10 hover:border-primary/40 hover:bg-card/60"
          >
            Get Membership — $12/month
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />25 free messages</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />No credit card</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Pay with Cash App</span>
        </motion.div>

        {/* Live stats — glassy with reflection */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.9 }}
          className="relative mt-24 max-w-3xl mx-auto"
        >
          <div className="absolute -inset-x-12 -inset-y-6 bg-gradient-to-r from-primary/10 via-purple-500/10 to-accent/10 blur-3xl -z-10" />
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06] rounded-2xl overflow-hidden emma-glass emma-gloss emma-noise">
            {[
              { v: "16+", l: "Capabilities" },
              { v: "15min", l: "Self-Improve Cycle" },
              { v: "8", l: "Operating Modes" },
              { v: "∞", l: "Monthly Messages" },
            ].map((s) => (
              <div key={s.l} className="relative bg-background/40 p-6 group">
                <div className="text-3xl sm:text-4xl font-bold emma-glow-text tracking-tight">{s.v}</div>
                <div className="text-xs text-muted-foreground mt-1.5 uppercase tracking-wider">{s.l}</div>
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
          {/* Reflection */}
          <div
            className="h-16 mx-12 rounded-b-2xl opacity-40"
            style={{
              background: "linear-gradient(to bottom, hsl(var(--card) / 0.3), transparent)",
              maskImage: "linear-gradient(to bottom, #000, transparent)",
              WebkitMaskImage: "linear-gradient(to bottom, #000, transparent)",
              transform: "scaleY(-1)",
              filter: "blur(4px)",
            }}
          />
        </motion.div>
      </section>

      {/* Modes */}
      <section id="modes" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">[ 8 · Operating Modes ]</div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight">
            One Emma. <span className="text-muted-foreground">Every job.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Switch modes mid-conversation. Emma keeps context, memory, and goals across all of them.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODES.map((m, i) => (
            <motion.div
              key={m.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <TiltCard
                onClick={() => navigate(user ? m.path : "/sign-up")}
                className="cursor-pointer h-full"
              >
                <div className="relative h-full p-6 rounded-2xl emma-glass emma-gloss overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/10 border border-white/10 flex items-center justify-center shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4),0_0_0_1px_hsl(var(--primary)/0.2)_inset]">
                      <m.icon className="h-5 w-5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                  <div className="font-semibold mb-1 text-base">{m.name}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{m.blurb}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">[ Every Capability ]</div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight">
            Built like an <span className="emma-glow-text">AGI</span>,
            <br />
            <span className="text-muted-foreground">not a chatbot.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Emma is a system of reasoning, memory, tools, agents, and safety — orchestrated to actually finish work.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: (i % 6) * 0.04 }}
            >
              <TiltCard className="h-full">
                <div className="relative h-full p-6 rounded-2xl emma-glass emma-gloss emma-noise overflow-hidden hover:border-primary/30 transition-colors">
                  <div className={`absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${f.color} opacity-[0.10] blur-3xl group-hover:opacity-30 transition-opacity duration-500`} />
                  <div className={`relative h-11 w-11 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-[0_8px_24px_-6px_currentColor,0_0_0_1px_hsl(0_0%_100%/0.1)_inset]`}>
                    <f.icon className="h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                  </div>
                  <div className="font-semibold mb-2 text-base tracking-tight">{f.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works — orbit-style */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">[ Under The Hood ]</div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight">
            An autonomous loop
            <br />
            <span className="text-muted-foreground">that never stops.</span>
          </h2>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          {[
            { n: "01", t: "Perceive", d: "Ingests your goal, context, memory, and live world state." },
            { n: "02", t: "Plan", d: "Decomposes into sub-goals via tree-of-thought planning." },
            { n: "03", t: "Act", d: "Spawns agents — search, code, browse, generate — in parallel." },
            { n: "04", t: "Reflect", d: "Benchmarks output, updates world model, ships self-improvements." },
          ].map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <TiltCard className="h-full">
                <div className="relative p-6 rounded-2xl emma-glass emma-gloss h-full">
                  <div className="absolute top-6 right-6 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))] emma-pulse" />
                  <div className="text-5xl font-bold emma-glow-text mb-3 opacity-80 tracking-tighter">{step.n}</div>
                  <div className="font-semibold text-lg mb-2">{step.t}</div>
                  <div className="text-sm text-muted-foreground">{step.d}</div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">[ Pricing ]</div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight">
            One price.
            <br />
            <span className="emma-glow-text">Everything unlocked.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">No tiers. No metering. No surprise overages.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <TiltCard>
            <div className="p-8 rounded-3xl emma-glass emma-gloss h-full">
              <div className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Free</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-6xl font-bold tracking-tighter">$0</span>
              </div>
              <div className="text-sm text-muted-foreground mb-6">Try every mode, no card needed</div>
              <Button onClick={goApp} variant="outline" className="w-full mb-6 emma-glass">Start Free</Button>
              <ul className="space-y-3 text-sm">
                {[
                  "25 messages to explore",
                  "Access to all 8 modes",
                  "Voice, build, research, data",
                  "Persistent memory",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          </TiltCard>

          {/* Membership — premium */}
          <TiltCard>
            <div className="relative p-8 rounded-3xl overflow-hidden h-full emma-gloss emma-noise"
              style={{
                background:
                  "linear-gradient(180deg, hsl(0 0% 100% / 0.06) 0%, hsl(0 0% 100% / 0.01) 50%, transparent 100%), linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(260 60% 60% / 0.10), hsl(var(--accent) / 0.08))",
                boxShadow:
                  "0 1px 0 hsl(0 0% 100% / 0.12) inset, 0 0 0 1px hsl(var(--primary) / 0.35), 0 30px 80px -20px hsl(var(--primary) / 0.4), 0 12px 30px -10px hsl(260 60% 40% / 0.4)",
              }}
            >
              {/* Animated gradient ring */}
              <div className="absolute -inset-px rounded-3xl pointer-events-none opacity-60"
                style={{
                  background: "conic-gradient(from 0deg, transparent, hsl(var(--primary) / 0.6), transparent 30%)",
                  animation: "emmaSpin 6s linear infinite",
                  mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  padding: "1px",
                }}
              />

              <div className="absolute top-0 right-0 px-3 py-1.5 bg-gradient-to-r from-primary to-purple-500 text-primary-foreground text-[10px] font-bold uppercase tracking-wider rounded-bl-2xl shadow-lg">
                Most Popular
              </div>

              <div className="relative">
                <div className="text-sm font-medium text-primary mb-2 uppercase tracking-wider">Membership</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-6xl font-bold tracking-tighter emma-glow-text">$12</span>
                  <span className="text-muted-foreground ml-2">/ month</span>
                </div>
                <div className="text-sm text-muted-foreground mb-6">Flat $12/month · cancel anytime · no contracts</div>
                <Button
                  onClick={() => setPaywallOpen(true)}
                  className="w-full mb-6 h-12 text-base font-semibold relative overflow-hidden group shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.7),0_0_0_1px_hsl(0_0%_100%/0.1)_inset]"
                >
                  <span className="relative z-10 flex items-center justify-center">
                    <Zap className="h-4 w-4 mr-2" />
                    Unlock Emma — $12/month
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </Button>
                <ul className="space-y-3 text-sm">
                  {[
                    { i: InfinityIcon, t: "Unlimited messages, every mode" },
                    { i: Cpu, t: "Full AGI dashboard + autonomous loops" },
                    { i: Eye, t: "Computer-use agent for real tasks" },
                    { i: Code2, t: "Project IDE with code execution" },
                    { i: Mic, t: "Voice conversations (ElevenLabs)" },
                    { i: ImageIcon, t: "Premium image generation" },
                    { i: Database, t: "Persistent memory + project storage" },
                    { i: Lock, t: "Pay monthly via Cash App — cancel anytime" },
                  ].map((x) => (
                    <li key={x.t} className="flex items-start gap-2">
                      <x.i className="h-4 w-4 text-primary mt-0.5 shrink-0 drop-shadow-[0_0_4px_hsl(var(--primary)/0.6)]" />
                      <span>{x.t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </TiltCard>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Payment goes to <span className="font-mono text-foreground">$mycashdirect2022</span> on Cash App. Access unlocks instantly after confirmation.
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary/80 mb-4">[ FAQ ]</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={i} className="group p-6 rounded-2xl emma-glass emma-gloss cursor-pointer transition-all hover:border-primary/30">
              <summary className="flex items-center justify-between font-semibold list-none">
                <span>{f.q}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-open:rotate-90 transition-transform" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-32">
        <div
          className="relative p-12 sm:p-20 rounded-[2rem] text-center overflow-hidden emma-gloss emma-noise"
          style={{
            background:
              "linear-gradient(180deg, hsl(0 0% 100% / 0.06), transparent 60%), linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(260 60% 60% / 0.12), hsl(var(--accent) / 0.10))",
            boxShadow:
              "0 1px 0 hsl(0 0% 100% / 0.12) inset, 0 0 0 1px hsl(var(--primary) / 0.3), 0 40px 100px -30px hsl(var(--primary) / 0.5), 0 20px 50px -10px hsl(260 60% 40% / 0.4)",
          }}
        >
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/30 blur-3xl emma-pulse" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-purple-500/30 blur-3xl emma-pulse" style={{ animationDelay: "1.5s" }} />
          </div>
          <div className="relative inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-500/20 mb-6 shadow-[0_0_40px_-4px_hsl(var(--primary)/0.6),0_0_0_1px_hsl(0_0%_100%/0.15)_inset] emma-float">
            <Globe className="h-10 w-10 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
          </div>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl mx-auto leading-[1.05]">
            Stop renting intelligence
            <br />
            <span className="emma-glow-text">by the message.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            One flat price. Every capability. $12/month for an AGI that improves itself while it works for you.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={goApp} size="lg" variant="outline" className="h-14 px-8 emma-glass border-white/10">
              Try Free First
            </Button>
            <Button
              onClick={() => setPaywallOpen(true)}
              size="lg"
              className="h-14 px-8 font-semibold relative overflow-hidden group shadow-[0_16px_50px_-10px_hsl(var(--primary)/0.8),0_0_0_1px_hsl(0_0%_100%/0.1)_inset]"
            >
              <span className="relative z-10 flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Get Membership — $12/month
              </span>
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <EmmaAvatar size="sm" />
            <span>© {new Date().getFullYear()} Emma Intelligence</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/app" className="hover:text-foreground transition-colors">App</Link>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link to="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPaid={() => { setPaywallOpen(false); navigate("/app"); }}
        userEmail={(user as any)?.email}
        getToken={getToken}
      />
    </div>
  );
}
