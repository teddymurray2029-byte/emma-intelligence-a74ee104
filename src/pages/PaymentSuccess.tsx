import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { markLocalPaid } from "@/lib/fingerprint";
import { EmmaAvatar } from "@/components/EmmaAvatar";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

const VERIFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) { setStatus("failed"); return; }

    fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.paid) {
          markLocalPaid();
          setStatus("success");
        } else {
          setStatus("failed");
        }
      })
      .catch(() => setStatus("failed"));
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <EmmaAvatar size="lg" />
        {status === "verifying" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Verifying your payment...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <h1 className="text-2xl font-bold">Payment Successful!</h1>
            <p className="text-muted-foreground">You now have unlimited access to Emma AI.</p>
            <Button onClick={() => navigate("/")} size="lg">Start Using Emma</Button>
          </>
        )}
        {status === "failed" && (
          <>
            <h1 className="text-2xl font-bold text-destructive">Verification Failed</h1>
            <p className="text-muted-foreground">We couldn't verify your payment. Please contact support.</p>
            <Button onClick={() => navigate("/")} variant="outline">Go Back</Button>
          </>
        )}
      </div>
    </div>
  );
}
