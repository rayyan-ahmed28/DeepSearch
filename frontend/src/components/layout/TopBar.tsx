import { Link } from "react-router-dom";
import { Menu, Terminal, User } from "lucide-react";

import ModeBadge from "@/components/common/ModeBadge";
import ThemeToggle from "@/components/common/ThemeToggle";

interface TopBarProps {
  breadcrumb?: string;
  onMenu?: () => void;
}

export default function TopBar({ breadcrumb = "CORE://AUTONOMOUS_RESEARCH", onMenu }: TopBarProps) {
  return (
    <header className="print:hidden fixed top-0 left-0 lg:left-60 right-0 h-16 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/20 z-30 flex items-center justify-between gap-3 px-4 lg:px-8">
      <div className="flex items-center gap-2 min-w-0 font-label-code-sm text-label-code-sm text-outline">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="lg:hidden -ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
        >
          <Menu size={20} />
        </button>
        <Terminal size={16} className="hidden sm:block shrink-0" />
        <span className="hidden sm:block truncate">{breadcrumb}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden sm:block">
          <ModeBadge />
        </div>
        <ThemeToggle />
        <Link to="/settings" aria-label="Settings" title="Settings" className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User size={18} className="text-on-primary" />
        </Link>
      </div>
    </header>
  );
}
