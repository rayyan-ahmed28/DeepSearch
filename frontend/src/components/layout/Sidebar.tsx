import { NavLink } from "react-router-dom";
import { Search, History, FolderOpen, Gavel, LineChart, SlidersHorizontal } from "lucide-react";
import BrandMark from "@/components/common/BrandMark";

const navLinkClasses = (isActive: boolean) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors font-body-md text-body-md ${
    isActive
      ? "bg-primary-container text-on-primary-container font-medium border-l-2 border-primary"
      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface border-l-2 border-transparent"
  }`;

const domainLinkClasses =
  "flex items-center justify-between px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors";

export default function Sidebar() {
  return (
    <aside className="print:hidden fixed top-0 left-0 bottom-0 w-60 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col justify-between z-40 select-none">
      <div className="flex flex-col">
        <div className="h-16 px-4 flex items-center justify-between border-b border-outline-variant/20">
          <NavLink to="/dashboard" className="flex items-center gap-2 cursor-pointer">
            <BrandMark size={28} />
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">DeepSearch</span>
          </NavLink>
          <span className="font-label-code-sm text-label-code-sm text-outline border border-outline-variant/40 rounded px-1.5 py-0.5 bg-surface-container-low">
            v0.1
          </span>
        </div>

        <div className="p-3">
          <nav className="flex flex-col gap-1">
            <NavLink to="/research/new" className={({ isActive }) => navLinkClasses(isActive)}>
              <Search size={18} />
              <span>New Research</span>
            </NavLink>
            <NavLink to="/dashboard" end className={({ isActive }) => navLinkClasses(isActive)}>
              <History size={18} />
              <span>Research History</span>
            </NavLink>
            <NavLink to="/dashboard" className="flex items-center gap-3 px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors font-body-md text-body-md">
              <FolderOpen size={18} />
              <span>Saved Reports</span>
            </NavLink>
          </nav>

          <div className="my-4 border-t border-outline-variant/30" />

          <div className="px-3 mb-1.5">
            <span className="font-tag-caps text-tag-caps text-outline uppercase tracking-wider">Domain Shortcuts</span>
          </div>
          <nav className="flex flex-col gap-1">
            <NavLink to="/research/new" className={domainLinkClasses}>
              <div className="flex items-center gap-3">
                <Gavel size={18} className="text-secondary" />
                <span>Legal</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            </NavLink>
            <NavLink to="/research/new" className={domainLinkClasses}>
              <div className="flex items-center gap-3">
                <LineChart size={18} className="text-tertiary" />
                <span>Finance</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            </NavLink>
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
          <span className="font-tag-caps text-tag-caps text-outline">Local build · nothing leaves your browser</span>
        </div>
      </div>
    </aside>
  );
}
