import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { pmApi } from "@/lib/pm-api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function JoinProject() {
  const { token } = useParams();
  const nav = useNavigate();
  const { getToken, user, loading } = useAuth();
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (loading || !user || !token) return;
    setAccepting(true);
    pmApi.acceptInvite({
      token,
      display_name: user.user_metadata?.display_name,
      email: user.email,
    }, getToken)
      .then((r) => {
        toast.success("Joined project");
        nav(`/projects/${r.data.workspace_id}/board`);
      })
      .catch((e) => { toast.error(e.message); setAccepting(false); });
  }, [token, user, loading, getToken, nav]);

  if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-xl font-semibold mb-2">Sign in to join</h2>
          <p className="text-sm text-muted-foreground mb-4">You need an account to accept this project invite.</p>
          <Button onClick={() => nav(`/sign-in?redirect=/projects/join/${token}`)}>Sign in</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 text-center text-muted-foreground">
      <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
      Joining project…
    </div>
  );
}
