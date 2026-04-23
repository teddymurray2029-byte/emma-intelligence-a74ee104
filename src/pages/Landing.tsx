import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
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
  { q: "What does the yearly plan include?", a: "Unlimited messages across every mode — chat, research, build, voice, data, code execution, computer use, image generation. No per-message caps, no overage fees." },
  { q: "How does Emma differ from ChatGPT or Claude?", a: "Emma is an autonomous AGI system, not a chatbot. She runs a self-improvement loop every 15 minutes, benchmarks herself, modifies her own prompts and edge functions, and commits the diffs to GitHub. She also has a formal safety verifier and a multi-agent swarm." },
  { q: "Is my data private?", a: "Yes. Each user's conversations, memory, projects, and files are isolated by row-level security. Emma never trains on your data." },
  { q: "How do I pay?", a: "One Cash App payment to $mycashdirect2022. Include the unique reference code shown at checkout in the payment note. Access unlocks instantly." },
  { q: "Refunds?", a: "Cancel anytime within 7 days for a full refund. After that, the year is yours to use without limits." },
];

export default function Landing() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const goApp = () => navigate(user ? "/app" : "/sign-up");

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 w-[700px] h-[700px] rounded-full bg-purple-500/5 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <EmmaAvatar size="sm" />
            <span className="text-lg font-semibold tracking-tight">Emma Intelligence</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="#features" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2">Features</a>
            <a href="#modes" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2">Modes</a>
            <a href="#pricing" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2">Pricing</a>
            {user ? (
              <Button onClick={() => navigate("/app")} size="sm">Open App<ArrowRight className="h-4 w-4 ml-1" /></Button>
            ) : (
              <>
                <Link to="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
                <Button onClick={goApp} size="sm">Get Started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-6 pt-20 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary mb-8"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Autonomous AGI · Self-Improving · Live Now
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05] max-w-4xl mx-auto"
        >
          The first AI that{" "}
          <span className="emma-glow-text">improves itself</span>
          <br />while it works for you.
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
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <Button onClick={goApp} size="lg" className="h-14 px-8 text-base font-semibold group">
            Try Emma Free
            <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button onClick={() => setPaywallOpen(true)} size="lg" variant="outline" className="h-14 px-8 text-base font-semibold">
            Get Yearly Access — $79
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-6 flex items-center justify-center gap-6 text-xs text-muted-foreground"
        >
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />25 free messages</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />No credit card</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Pay with Cash App</span>
        </motion.div>

        {/* Live stats strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.9 }}
          className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40 rounded-2xl overflow-hidden border border-border/40 max-w-3xl mx-auto"
        >
          {[
            { v: "16+", l: "Capabilities" },
            { v: "15min", l: "Self-Improve Cycle" },
            { v: "8", l: "Operating Modes" },
            { v: "∞", l: "Yearly Messages" },
          ].map((s) => (
            <div key={s.l} className="bg-card/50 backdrop-blur p-6">
              <div className="text-3xl font-bold emma-glow-text">{s.v}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Modes — branch points */}
      <section id="modes" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-sm font-medium text-primary mb-3">8 OPERATING MODES</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">One Emma. Every job.</h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Switch modes mid-conversation. Emma keeps context, memory, and goals across all of them.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODES.map((m, i) => (
            <motion.button
              key={m.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              onClick={() => navigate(user ? m.path : "/sign-up")}
              className="group text-left p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur hover:border-primary/40 hover:bg-card/60 transition-all hover:-translate-y-1"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <m.icon className="h-5 w-5 text-primary" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
              <div className="font-semibold mb-1">{m.name}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{m.blurb}</div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-sm font-medium text-primary mb-3">EVERY CAPABILITY</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">Built like an AGI, not a chatbot.</h2>
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
              className="group relative p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur hover:border-primary/30 transition-all overflow-hidden"
            >
              <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${f.color} opacity-[0.07] blur-2xl group-hover:opacity-20 transition-opacity`} />
              <div className={`relative h-11 w-11 rounded-xl bg-gradient-to-br ${f.color} bg-opacity-10 flex items-center justify-center mb-4`}>
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <div className="font-semibold mb-2 text-base">{f.title}</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-sm font-medium text-primary mb-3">UNDER THE HOOD</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">An autonomous loop that never stops.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { n: "01", t: "Perceive", d: "Ingests your goal, context, memory, and live world state." },
            { n: "02", t: "Plan", d: "Decomposes into sub-goals via tree-of-thought planning." },
            { n: "03", t: "Act", d: "Spawns agents — search, code, browse, generate — in parallel." },
            { n: "04", t: "Reflect", d: "Benchmarks output, updates world model, ships self-improvements." },
          ].map((step) => (
            <div key={step.n} className="relative p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur">
              <div className="text-5xl font-bold emma-glow-text mb-3 opacity-60">{step.n}</div>
              <div className="font-semibold text-lg mb-2">{step.t}</div>
              <div className="text-sm text-muted-foreground">{step.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-sm font-medium text-primary mb-3">PRICING</div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">One price. Everything unlocked.</h2>
          <p className="mt-4 text-lg text-muted-foreground">No tiers. No metering. No surprise overages.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <div className="p-8 rounded-2xl border border-border/40 bg-card/40 backdrop-blur">
            <div className="text-sm font-medium text-muted-foreground mb-2">Free</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-5xl font-bold">$0</span>
            </div>
            <div className="text-sm text-muted-foreground mb-6">Try every mode, no card needed</div>
            <Button onClick={goApp} variant="outline" className="w-full mb-6">Start Free</Button>
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

          {/* Yearly */}
          <div className="relative p-8 rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/5 via-card/60 to-purple-500/5 backdrop-blur overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-bl-xl">
              MOST POPULAR
            </div>
            <div className="text-sm font-medium text-primary mb-2">Yearly</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-5xl font-bold">$79</span>
              <span className="text-muted-foreground">/ year</span>
            </div>
            <div className="text-sm text-muted-foreground mb-6">~$6.58/mo · billed once · cancel within 7 days</div>
            <Button onClick={() => setPaywallOpen(true)} className="w-full mb-6 h-12 text-base font-semibold">
              <Zap className="h-4 w-4 mr-2" />
              Unlock Emma for a Year
            </Button>
            <ul className="space-y-3 text-sm">
              {[
                { i: InfinityIcon, t: "Unlimited messages, every mode" },
                { i: Cpu, t: "Full AGI dashboard + autonomous loops" },
                { i: Eye, t: "Computer-use agent for real tasks" },
                { i: Code2, t: "Project IDE with code execution" },
                { i: Mic, t: "Voice conversations (ElevenLabs)" },
                { i: ImageIcon, t: "Premium image generation" },
                { i: Database, t: "Lifetime memory + project storage" },
                { i: Lock, t: "Pay once via Cash App — no subscription" },
              ].map((x) => (
                <li key={x.t} className="flex items-start gap-2">
                  <x.i className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{x.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Payment goes to <span className="font-mono text-foreground">$mycashdirect2022</span> on Cash App. Access unlocks instantly after confirmation.
        </p>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-12">
          <div className="text-sm font-medium text-primary mb-3">FAQ</div>
          <h2 className="text-4xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={i} className="group p-6 rounded-2xl border border-border/40 bg-card/40 backdrop-blur cursor-pointer">
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
        <div className="relative p-12 sm:p-20 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-purple-500/10 backdrop-blur text-center overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl" />
          </div>
          <Globe className="h-12 w-12 text-primary mx-auto mb-6" />
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">Stop renting intelligence by the message.</h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            One payment. Every capability. A full year of an AGI that improves itself while it works for you.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={goApp} size="lg" variant="outline" className="h-14 px-8">Try Free First</Button>
            <Button onClick={() => setPaywallOpen(true)} size="lg" className="h-14 px-8 font-semibold">
              <Zap className="h-5 w-5 mr-2" />
              Get Yearly Access — $79
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <EmmaAvatar size="sm" />
            <span>© {new Date().getFullYear()} Emma Intelligence</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/app" className="hover:text-foreground">App</Link>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <Link to="/sign-in" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onPaid={() => { setPaywallOpen(false); navigate("/app"); }}
        userEmail={user?.primaryEmailAddress?.emailAddress}
        getToken={getToken}
      />
    </div>
  );
}
