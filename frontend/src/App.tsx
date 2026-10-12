import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "@/pages/LoginPage";
import SignUpPage from "@/pages/SignUpPage";
import DashboardPage from "@/pages/DashboardPage";
import NewResearchPage from "@/pages/NewResearchPage";
import ResearchExecutionPage from "@/pages/ResearchExecutionPage";
import SettingsPage from "@/pages/SettingsPage";

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
  return (
    <Routes>
      {/* The Landing page is still a stub (built in a later phase); until then, open on Login. */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/research/new" element={<NewResearchPage />} />
      <Route path="/research/:id" element={<ResearchExecutionPage />} />
      <Route path="/research/:id/workspace" element={<OnDemand><ResearchWorkspacePage /></OnDemand>} />
      <Route path="/research/:id/report" element={<OnDemand><ReportPage /></OnDemand>} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
