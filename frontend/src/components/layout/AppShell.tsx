import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import ErrorBoundary from "@/components/common/ErrorBoundary";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface AppShellProps {
  children: ReactNode;
  breadcrumb?: string;
}

/**
 * Sidebar + top bar + page. From 1024 px wide the sidebar is fixed; narrower,
 * it slides in from the ☰ button and closes on navigation or Escape.
 */
export default function AppShell({ children, breadcrumb }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname, search } = useLocation();

  useEffect(() => setNavOpen(false), [pathname, search]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary-container focus:text-on-primary-container font-body-md text-body-md"
      >
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}
      <div className="lg:pl-60 print:pl-0 flex flex-col min-h-screen">
        <TopBar breadcrumb={breadcrumb} onMenu={() => setNavOpen(true)} />
        <main id="main" tabIndex={-1} className="flex-1 pt-16 print:pt-0 bg-surface outline-none min-w-0">
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
