import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";

import ErrorBoundary from "@/components/common/ErrorBoundary";
import RunFinishedEffects from "@/components/common/RunFinishedEffects";
import NotFoundPage from "@/pages/NotFoundPage";
import LandingPage from "@/pages/LandingPage";

import LoginPage from "@/pages/LoginPage";
import SignUpPage from "@/pages/SignUpPage";
import DashboardPage from "@/pages/DashboardPage";
import NewResearchPage from "@/pages/NewResearchPage";
import ResearchExecutionPage from "@/pages/ResearchExecutionPage";
import ResearchHistoryPage from "@/pages/ResearchHistoryPage";
import SettingsPage from "@/pages/SettingsPage";
import { useSettings } from "@/store/settingsStore";

// These pages draw charts (Recharts, ~400 KB), so they load on demand.
const ResearchWorkspacePage = lazy(() => import("@/pages/ResearchWorkspacePage"));
const ReportPage = lazy(() => import("@/pages/ReportPage"));

function OnDemand({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen bg-surface" />}>{children}</Suspense>;
}

// Route map mirrors the navigation wired in the Stitch prototype
// (Landing -> Login/SignUp -> Dashboard -> New Research -> Execution
// -> Workspace -> Report), plus Settings off the shared sidebar.
export default function App() {
  const motion = useSettings((s) => s.motion);
  const { pathname } = useLocation();
  return (
    <MotionConfig reducedMotion={motion === "reduce" ? "always" : motion === "full" ? "never" : "user"}>
      <RunFinishedEffects />
      <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/research/new" element={<NewResearchPage />} />
        <Route path="/history" element={<ResearchHistoryPage />} />
        <Route path="/research/:id" element={<ResearchExecutionPage />} />
        <Route path="/research/:id/workspace" element={<OnDemand><ResearchWorkspacePage /></OnDemand>} />
        <Route path="/research/:id/report" element={<OnDemand><ReportPage /></OnDemand>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </ErrorBoundary>
    </MotionConfig>
  );
}
