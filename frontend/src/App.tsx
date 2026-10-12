import { Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignUpPage from "@/pages/SignUpPage";
import DashboardPage from "@/pages/DashboardPage";
import NewResearchPage from "@/pages/NewResearchPage";
import ResearchExecutionPage from "@/pages/ResearchExecutionPage";
import ResearchWorkspacePage from "@/pages/ResearchWorkspacePage";
import ReportPage from "@/pages/ReportPage";
import SettingsPage from "@/pages/SettingsPage";

// Route map mirrors the navigation wired in the Stitch prototype
// (Landing -> Login/SignUp -> Dashboard -> New Research -> Execution
// -> Workspace -> Report), plus Settings off the shared sidebar.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/research/new" element={<NewResearchPage />} />
      <Route path="/research/:id" element={<ResearchExecutionPage />} />
      <Route path="/research/:id/workspace" element={<ResearchWorkspacePage />} />
      <Route path="/research/:id/report" element={<ReportPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
