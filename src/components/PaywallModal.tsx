import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Shield, Zap, Lock } from "lucide-react";
import { generateFingerprint, markLocalPaid, FREE_LIMIT } from "@/lib/fingerprint";
import { toast } from "sonner";

const PAYMENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  userEmail?: string;
  getToken?: () => Promise<string | null>;
}

export function PaywallModal({ open, onClose, onPaid, userEmail, getToken }: PaywallModalProps) {
  const [email, setEmail] = useState(userEmail || "");
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const fingerprint = await generateFingerprint();
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (getToken) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const resp = await fetch(PAYMENT_URL, {
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

      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        toast.error(data.error || "Failed to create payment session");
      }
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    }
    setLoading(false);
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
            You've used all {FREE_LIMIT} free messages. Get unlimited access for just $12.
          </DialogDescription>
        </DialogHeader>

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
          </div>

          {!userEmail && (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email (for receipt)</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <Button
            onClick={handlePay}
            disabled={loading}
            className="w-full h-12 text-base font-semibold"
            size="lg"
          >
            <CreditCard className="h-5 w-5 mr-2" />
            {loading ? "Processing..." : "Pay $12 — Unlock Forever"}
          </Button>

          <p className="text-[10px] text-center text-muted-foreground">
            Secure payment via Stripe. One-time charge, no subscription.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
