import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";

import BrandMark from "@/components/common/BrandMark";

/** Any address the app doesn't know. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark size={44} />
      <Compass size={28} className="text-outline" />
      <h1 className="font-headline-lg text-headline-lg">Page not found</h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
        There is nothing at <span className="font-label-code-md text-label-code-md text-on-surface break-all">{pathname}</span>.
        Research runs live under <span className="font-label-code-md text-label-code-md">/research/…</span>; your past runs are in
        Research History.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/dashboard" className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-medium font-body-md text-body-md">
          Dashboard
        </Link>
        <Link to="/history" className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-md text-body-md">
          Research history
        </Link>
        <Link to="/" className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-high font-body-md text-body-md">
          Home
        </Link>
      </div>
    </div>
  );
}
