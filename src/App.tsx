import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAgiTokenGetter } from "@/lib/agi-api";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import ClerkSignIn from "./pages/ClerkSignIn";
import ClerkSignUp from "./pages/ClerkSignUp";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Settings from "./pages/Settings";
import AGIDashboard from "./pages/AGIDashboard";
import ASITransformation from "./pages/ASITransformation";
import ApiKeys from "./pages/ApiKeys";
import AdminLearning from "./pages/AdminLearning";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import Docs from "./pages/Docs";
import Capabilities from "./pages/Capabilities";
import Marketplace from "./pages/Marketplace";
import Projects from "./pages/Projects";
import ProjectLayout from "./pages/ProjectLayout";
import ProjectBoard from "./pages/ProjectBoard";
import ProjectBacklog from "./pages/ProjectBacklog";
import ProjectChat from "./pages/ProjectChat";
import ProjectPipeline from "./pages/ProjectPipeline";
import ProjectMembers from "./pages/ProjectMembers";
import ProjectSettings from "./pages/ProjectSettings";
import StoryDetail from "./pages/StoryDetail";
import JoinProject from "./pages/JoinProject";
import PhysicsInventions from "./pages/PhysicsInventions";
import SwarmPage from "./pages/Swarm";
import SafetyPage from "./pages/Safety";
import TransferPage from "./pages/Transfer";
import ImageStudio from "./pages/ImageStudio";
import Changelog from "./pages/Changelog";
import Benchmarks from "./pages/Benchmarks";

const queryClient = new QueryClient();

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_ZXZpZGVudC1taW5rLTcuY2xlcmsuYWNjb3VudHMuZGV2JA";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function AgiTokenBridge() {
  const { getToken } = useClerkAuth();

  useLayoutEffect(() => {
    setAgiTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

const App = () => (
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/sign-in">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AgiTokenBridge />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/sign-in/*" element={<ClerkSignIn />} />
            <Route path="/sign-up/*" element={<ClerkSignUp />} />
            <Route path="/" element={<Landing />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/capabilities" element={<Capabilities />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/inventions" element={<PhysicsInventions />} />
            <Route path="/swarm" element={<ProtectedRoute><SwarmPage /></ProtectedRoute>} />
            <Route path="/safety" element={<ProtectedRoute><SafetyPage /></ProtectedRoute>} />
            <Route path="/transfer" element={<ProtectedRoute><TransferPage /></ProtectedRoute>} />
            <Route path="/images" element={<ProtectedRoute><ImageStudio /></ProtectedRoute>} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/app" element={<Index />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/agi" element={<ProtectedRoute><AGIDashboard /></ProtectedRoute>} />
            <Route path="/asi" element={<ProtectedRoute><ASITransformation /></ProtectedRoute>} />
            <Route path="/api-keys" element={<ProtectedRoute><ApiKeys /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminLearning /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/projects/join/:token" element={<JoinProject />} />
            <Route path="/projects/:id" element={<ProtectedRoute><ProjectLayout /></ProtectedRoute>}>
              <Route index element={<ProjectBoard />} />
              <Route path="board" element={<ProjectBoard />} />
              <Route path="backlog" element={<ProjectBacklog />} />
              <Route path="chat" element={<ProjectChat />} />
              <Route path="pipeline" element={<ProjectPipeline />} />
              <Route path="members" element={<ProjectMembers />} />
              <Route path="settings" element={<ProjectSettings />} />
              <Route path="story/:storyId" element={<StoryDetail />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>
);

export default App;
