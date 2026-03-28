import { useState, useEffect } from "react";
import { useUser, useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { dbProxy } from "@/lib/db-proxy";

export function useAuth() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useClerkAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || !getToken) return;
    dbProxy("check_admin", {}, getToken)
      .then((res) => setIsAdmin(res.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, [user, getToken]);

  return {
    user: user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress ?? "",
          user_metadata: {
            display_name: user.fullName || user.firstName || user.username || "",
            avatar_url: user.imageUrl || "",
          },
        }
      : null,
    session: user ? { access_token: "clerk-managed" } : null,
    loading: !isLoaded,
    isAdmin,
    signOut: () => signOut(),
    getToken,
  };
}
