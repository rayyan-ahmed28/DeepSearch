import { Terminal, User } from "lucide-react";

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
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded bg-surface-container border border-outline-variant/40 font-label-code-sm text-label-code-sm text-on-surface-variant">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
          <span>DEMO MODE</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User size={18} className="text-on-primary" />
        </div>
      </div>
    </header>
  );
}
