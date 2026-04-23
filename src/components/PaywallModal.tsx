import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, Shield, Zap, Lock, Copy, ExternalLink, CheckCircle2 } from "lucide-react";
import { generateFingerprint, markLocalPaid, FREE_LIMIT } from "@/lib/fingerprint";
import { toast } from "sonner";

const CREATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cashapp-create`;
const VERIFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cashapp-verify`;

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  userEmail?: string;
  getToken?: () => Promise<string | null>;
}

type Step = "intro" | "pay" | "verifying";

export function PaywallModal({ open, onClose, onPaid, userEmail, getToken }: PaywallModalProps) {
  const [email, setEmail] = useState(userEmail || "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [reference, setReference] = useState("");
  const [cashAppUrl, setCashAppUrl] = useState("");
  const [confirmCode, setConfirmCode] = useState("");

  const headersWithAuth = async () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (getToken) {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const fingerprint = await generateFingerprint();
      const headers = await headersWithAuth();

      const resp = await fetch(CREATE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ fingerprint, email: email || undefined }),
      });
      const data = await resp.json();

      if (data.isPaid) {
        markLocalPaid();
        onPaid();
        toast.success("You already have access!");
        return;
      }

      if (data.reference && data.cashAppUrl) {
        setReference(data.reference);
        setCashAppUrl(data.cashAppUrl);
        setStep("pay");
      } else {
        toast.error(data.error || "Failed to create payment");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed");
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!confirmCode.trim()) {
      toast.error("Enter the reference code from your payment");
      return;
    }
    setLoading(true);
    setStep("verifying");
    try {
      const fingerprint = await generateFingerprint();
      const headers = await headersWithAuth();
      const resp = await fetch(VERIFY_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ reference: confirmCode.trim(), fingerprint }),
      });
      const data = await resp.json();
      if (data.paid) {
        markLocalPaid();
        toast.success("Access unlocked!");
        onPaid();
      } else {
        toast.error(data.error || "Could not verify payment");
        setStep("pay");
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed");
      setStep("pay");
    }
    setLoading(false);
  };

  const copyRef = () => {
    navigator.clipboard.writeText(reference);
    toast.success("Reference copied");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Zap className="h-5 w-5 text-primary" />
            Unlock Full Access
          </DialogTitle>
          <DialogDescription>
            {step === "intro" && `You've used all ${FREE_LIMIT} free messages. Pay $12 with Cash App for lifetime access.`}
            {step === "pay" && "Complete the steps below to unlock Emma."}
            {step === "verifying" && "Verifying your payment..."}
          </DialogDescription>
        </DialogHeader>

        {step === "intro" && (
          <div className="space-y-4 py-4">
            <div className="grid gap-3">
              <div className="flex items-start gap-3 text-sm">
                <Zap className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>Unlimited messages across all modes</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>Research, build, analyze — no limits</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <Lock className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>One-time payment, lifetime access</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <DollarSign className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>Pay instantly with Cash App</span>
              </div>
            </div>

            {!userEmail && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Email (optional, for receipt)</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}

            <Button
              onClick={handleStart}
              disabled={loading}
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              <DollarSign className="h-5 w-5 mr-2" />
              {loading ? "Loading..." : "Pay $12 with Cash App"}
            </Button>

            <p className="text-[10px] text-center text-muted-foreground">
              Sent to <span className="font-mono">$mycashdirect2022</span>. One-time charge, no subscription.
            </p>
          </div>
        )}

        {step === "pay" && (
          <div className="space-y-4 py-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
                <span>Open Cash App and send <strong>$12</strong> to <span className="font-mono font-semibold">$mycashdirect2022</span></span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
                <div className="flex-1 space-y-2">
                  <span>Paste this reference in the payment <strong>note</strong>:</span>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 font-mono text-base font-bold">
                    <span className="flex-1 select-all">{reference}</span>
                    <Button size="sm" variant="ghost" onClick={copyRef} className="h-7 w-7 p-0">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
                <span>Come back here and confirm your reference below</span>
              </li>
            </ol>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(cashAppUrl, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Cash App ($12 prefilled)
            </Button>

            <div className="space-y-2 pt-2 border-t">
              <label className="text-sm font-medium">Confirm your reference code</label>
              <Input
                placeholder="EMMA-XXXXXX"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <Button
                onClick={handleVerify}
                disabled={loading || !confirmCode.trim()}
                className="w-full h-11"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {loading ? "Verifying..." : "I've Paid — Unlock Access"}
              </Button>
            </div>

            <p className="text-[10px] text-center text-muted-foreground">
              Payments are reviewed against Cash App activity. Fraudulent confirmations will revoke access.
            </p>
          </div>
        )}

        {step === "verifying" && (
          <div className="py-12 text-center text-sm text-muted-foreground">Verifying...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
