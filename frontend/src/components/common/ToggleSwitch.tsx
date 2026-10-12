interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}

export default function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-surface-container transition-colors">
      <div className="flex flex-col">
        <span className="font-headline-sm text-headline-sm text-on-surface">{label}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
          checked ? "bg-primary-container" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full transition-transform ${
            checked ? "translate-x-5 bg-on-primary" : "translate-x-0 bg-outline"
          }`}
        />
      </button>
    </div>
  );
}
