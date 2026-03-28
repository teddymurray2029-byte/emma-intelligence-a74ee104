import { SignIn } from "@clerk/clerk-react";
import { EmmaAvatar } from "@/components/EmmaAvatar";

export default function ClerkSignIn() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 gap-8">
      <div className="flex flex-col items-center gap-3">
        <EmmaAvatar size="lg" />
        <h1 className="text-2xl font-semibold emma-glow-text">Emma</h1>
        <p className="text-sm text-muted-foreground">Emergent Meta-cognitive Multimodal Architecture</p>
      </div>
      <SignIn
        path="/sign-in"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-card border border-border shadow-xl",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton: "bg-secondary border-border text-foreground hover:bg-accent",
            formFieldInput: "bg-secondary border-border text-foreground",
            formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
            footerActionLink: "text-primary hover:text-primary/80",
            dividerLine: "bg-border",
            dividerText: "text-muted-foreground",
          },
        }}
      />
    </div>
  );
}
