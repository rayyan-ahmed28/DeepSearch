import { AlertTriangle } from "lucide-react";

/** Shown when a run stopped early (backend error, lost connection, run unknown to the server). */
export default function RunErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-error/40 bg-error-container/20 px-4 py-3">
      <AlertTriangle size={18} className="text-error shrink-0 mt-0.5" />
      <p className="font-body-md text-body-md text-on-surface">{message}</p>
    </div>
  );
}
