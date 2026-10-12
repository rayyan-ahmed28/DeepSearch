import { Loader2 } from "lucide-react";

/** Shown while a run that isn't in this browser is looked up in the saved history. */
export default function RunLoading({ id }: { id: string }) {
  return (
    <div role="status" className="w-full max-w-xl mx-auto px-4 sm:px-8 py-24 flex flex-col items-center text-center gap-3">
      <Loader2 size={28} className="text-primary animate-spin" />
      <p className="font-body-md text-body-md text-on-surface-variant">
        Opening run <span className="font-label-code-md text-label-code-md text-on-surface">{id}</span> from the saved history
      </p>
    </div>
  );
}
