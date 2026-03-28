import { useUser, useClerk, useAuth as useClerkAuth } from "@clerk/clerk-react";

export function useAuth() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useClerkAuth();

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
    signOut: () => signOut(),
    getToken,
  };
}
