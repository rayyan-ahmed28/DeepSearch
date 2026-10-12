import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface AppShellProps {
  children: ReactNode;
  breadcrumb?: string;
}

export default function AppShell({ children, breadcrumb }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <Sidebar />
      <div className="pl-60 print:pl-0 flex flex-col min-h-screen">
        <TopBar breadcrumb={breadcrumb} />
        <main className="flex-1 pt-16 print:pt-0 bg-surface">{children}</main>
      </div>
    </div>
  );
}
