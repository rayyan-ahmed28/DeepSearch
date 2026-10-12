import { Link, NavLink, useLocation } from "react-router-dom";
import { Search, History, FolderOpen, Gavel, LineChart, SlidersHorizontal, X } from "lucide-react";
import BrandMark from "@/components/common/BrandMark";
import { APP_VERSION } from "@/lib/version";

const navLinkClasses = (isActive: boolean) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors font-body-md text-body-md ${
    isActive
      ? "bg-primary-container text-on-primary-container font-medium border-l-2 border-primary"
      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface border-l-2 border-transparent"
  }`;

const domainLinkClasses =
  "flex items-center justify-between px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors";

interface SidebarProps {
  /** Below 1024 px the sidebar is a drawer; these control it. */
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { pathname, search } = useLocation();
  const onHistory = pathname === "/history";
  const savedView = onHistory && new URLSearchParams(search).get("view") === "saved";
  return (
    <aside
      aria-label="Main navigation"
      className={`print:hidden fixed top-0 left-0 bottom-0 w-60 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col justify-between z-50 select-none overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      <div className="flex flex-col">
        <div className="h-16 px-4 flex items-center justify-between border-b border-outline-variant/20">
          <NavLink to="/dashboard" className="flex items-center gap-2 cursor-pointer">
            <BrandMark size={28} />
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">DeepSearch</span>
          </NavLink>
          <div className="flex items-center gap-1.5">
            <span className="font-label-code-sm text-label-code-sm text-outline border border-outline-variant/40 rounded px-1.5 py-0.5 bg-surface-container-low">
              v{APP_VERSION.split(".").slice(0, 2).join(".")}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-3">
          <nav className="flex flex-col gap-1">
            <NavLink to="/research/new" className={({ isActive }) => navLinkClasses(isActive)}>
              <Search size={18} />
              <span>New Research</span>
            </NavLink>
            <Link to="/history" aria-current={onHistory && !savedView ? "page" : undefined} className={navLinkClasses(onHistory && !savedView)}>
              <History size={18} />
              <span>Research History</span>
            </Link>
            <Link to="/history?view=saved" aria-current={savedView ? "page" : undefined} className={navLinkClasses(savedView)}>
              <FolderOpen size={18} />
              <span>Saved Reports</span>
            </Link>
          </nav>

          <div className="my-4 border-t border-outline-variant/30" />

          <div className="px-3 mb-1.5">
            <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">Domain Shortcuts</span>
          </div>
          <nav className="flex flex-col gap-1">
            <Link to="/research/new?mode=legal" className={domainLinkClasses} title="New legal research">
              <div className="flex items-center gap-3">
                <Gavel size={18} className="text-secondary" />
                <span>Legal</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            </Link>
            <Link to="/research/new?mode=finance" className={domainLinkClasses} title="New finance research">
              <div className="flex items-center gap-3">
                <LineChart size={18} className="text-tertiary" />
                <span>Finance</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            </Link>
          </nav>
        </div>
      </div>

      <div className="p-3 border-t border-outline-variant/20 flex flex-col gap-1.5">
        <nav className="flex flex-col gap-1">
          <NavLink to="/settings" className={({ isActive }) => navLinkClasses(isActive)}>
            <SlidersHorizontal size={18} />
            <span>Settings</span>
          </NavLink>
        </nav>
        <div className="mt-1 p-3 rounded-lg bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="font-label-code-sm text-label-code-sm text-tertiary font-semibold uppercase tracking-wider">
              Demo Session
            </span>
          </div>
          <span className="font-tag-caps text-tag-caps text-outline">Local build · history is saved on this computer</span>
        </div>
      </div>
    </aside>
  );
}
