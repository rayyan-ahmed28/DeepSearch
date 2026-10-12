/**
 * The abstract agent-topology illustration used on Login (and, in
 * spirit, the Landing hero). Static geometric shapes only — no
 * mascot/robot imagery, per the design brief.
 */
export default function AgentNetworkVignette() {
  return (
    <div className="relative w-full max-w-xl aspect-[16/10] bg-surface-container/30 rounded-xl p-4 flex items-center justify-center overflow-hidden shadow-lg">
      <svg className="absolute inset-0 w-full h-full" fill="none" viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lineGrad1" x1="120" x2="320" y1="200" y2="120" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgb(var(--c-primary-container))" stopOpacity="0.7" />
            <stop offset="1" stopColor="rgb(var(--c-tertiary))" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="lineGrad2" x1="320" x2="520" y1="120" y2="210" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgb(var(--c-tertiary))" stopOpacity="0.8" />
            <stop offset="1" stopColor="rgb(var(--c-secondary))" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="lineGrad3" x1="320" x2="320" y1="280" y2="120" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgb(var(--c-primary-container))" stopOpacity="0.2" />
            <stop offset="1" stopColor="rgb(var(--c-primary-container))" stopOpacity="0.9" />
          </linearGradient>
          <filter id="glowIndigo" height="140%" width="140%" x="-20%" y="-20%">
            <feGaussianBlur result="blur" stdDeviation="6" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <path d="M40 80 H600 M40 160 H600 M40 240 H600 M40 320 H600" stroke="rgb(var(--c-outline-variant))" strokeDasharray="4 6" strokeOpacity="0.15" />
        <path d="M120 40 V360 M240 40 V360 M360 40 V360 M480 40 V360" stroke="rgb(var(--c-outline-variant))" strokeDasharray="4 6" strokeOpacity="0.15" />

        <path d="M130 200 L320 120" stroke="url(#lineGrad1)" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M320 120 L510 210" stroke="url(#lineGrad2)" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M130 200 L320 280" stroke="rgb(var(--c-outline-variant))" strokeOpacity="0.4" strokeWidth="1" />
        <path d="M320 280 L510 210" stroke="rgb(var(--c-outline-variant))" strokeOpacity="0.4" strokeWidth="1" />
        <path d="M320 120 L320 280" stroke="url(#lineGrad3)" strokeDasharray="3 3" strokeWidth="1.5" />
        <path d="M210 90 L320 120 L430 80" stroke="rgb(var(--c-tertiary))" strokeOpacity="0.3" strokeWidth="1" />

        {/* Gateway / discovery node */}
        <g>
          <circle cx="130" cy="200" fill="rgb(var(--c-surface-container))" r="18" />
          <circle cx="130" cy="200" fill="rgb(var(--c-primary-container))" filter="url(#glowIndigo)" r="10" />
          <circle cx="130" cy="200" fill="#ffffff" r="4" />
          <text className="font-label-code-sm text-[10px]" fill="rgb(var(--c-on-surface-variant))" textAnchor="middle" x="130" y="235">
            AGENT_DISCOVERY
          </text>
        </g>

        {/* Synthesis / coordinator node */}
        <g>
          <circle cx="320" cy="120" fill="rgb(var(--c-surface-container))" r="26" />
          <circle cx="320" cy="120" fill="rgb(var(--c-tertiary-container))" opacity="0.4" r="16" />
          <circle cx="320" cy="120" fill="rgb(var(--c-tertiary))" r="9" />
          <circle cx="320" cy="120" fill="#ffffff" r="4" />
          <text className="font-label-code-sm text-[11px] font-semibold" fill="rgb(var(--c-tertiary))" textAnchor="middle" x="320" y="85">
            SYNTHESIS_REASONER
          </text>
        </g>

        {/* Evidentiary ledger node */}
        <g>
          <circle cx="510" cy="210" fill="rgb(var(--c-surface-container))" r="20" />
          <circle cx="510" cy="210" fill="rgb(var(--c-secondary))" r="11" />
          <circle cx="510" cy="210" fill="#ffffff" r="4" />
          <text className="font-label-code-sm text-[10px]" fill="rgb(var(--c-on-surface-variant))" textAnchor="middle" x="510" y="245">
            EVIDENTIARY_LEDGER
          </text>
        </g>

        {/* Cross-audit sub-agent */}
        <g>
          <circle cx="320" cy="280" fill="rgb(var(--c-surface-container))" r="14" />
          <circle cx="320" cy="280" fill="rgb(var(--c-primary-container))" opacity="0.8" r="7" />
          <circle cx="320" cy="280" fill="#ffffff" r="2.5" />
          <text className="font-label-code-sm text-[9px]" fill="rgb(var(--c-outline))" textAnchor="middle" x="320" y="310">
            CROSS_AUDIT
          </text>
        </g>
      </svg>
    </div>
  );
}
