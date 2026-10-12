import { Link } from "react-router-dom";
import { Terminal, User } from "lucide-react";

import ModeBadge from "@/components/common/ModeBadge";
import ThemeToggle from "@/components/common/ThemeToggle";

interface TopBarProps {
  breadcrumb?: string;
}

export default function TopBar({ breadcrumb = "CORE://AUTONOMOUS_RESEARCH" }: TopBarProps) {
  return (
    <header className="print:hidden fixed top-0 left-60 right-0 h-16 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/20 z-30 flex items-center justify-between px-8">
      <div className="flex items-center gap-2 font-label-code-sm text-label-code-sm text-outline">
        <Terminal size={16} />
        <span>{breadcrumb}</span>
      </div>
      <div className="flex items-center gap-3">
        <ModeBadge />
        <ThemeToggle />
        <Link to="/settings" title="Settings" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User size={18} className="text-on-primary" />
        </Link>
      </div>
    </header>
  );
}
