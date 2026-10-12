interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * The DeepSearch crosshair mark — a coordinator node (solid dot) ringed by
 * a dashed verification ring, with four routing lines extending outward.
 * Ported as inline SVG from the approved Stitch brand asset rather than
 * depending on its externally-hosted image URL.
 */
export default function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="DeepSearch"
    >
      <rect x="1" y="1" width="62" height="62" rx="16" fill="#121318" stroke="#c4c0ff" strokeOpacity="0.5" strokeWidth="2" />
      <line x1="32" y1="8" x2="32" y2="20" stroke="#8781ff" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="32" y1="44" x2="32" y2="56" stroke="#8781ff" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="8" y1="32" x2="20" y2="32" stroke="#8781ff" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="44" y1="32" x2="56" y2="32" stroke="#8781ff" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="16" stroke="#5c5b66" strokeWidth="2" />
      <circle cx="32" cy="32" r="16" stroke="#29a195" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="9" fill="#8781ff" />
    </svg>
  );
}
