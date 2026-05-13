/**
 * The north-star symbol — a slow-pulsing emblem we keep through every release.
 * See docs/UI_DESIGN.md §13.
 */
export function NorthStar({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Stockhausen"
      className="animate-north-star-pulse text-neon-magenta"
    >
      <defs>
        <radialGradient id="ns-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="60%" stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#ns-glow)" />
      <path
        d="M32 4 L35 28 L60 32 L35 36 L32 60 L29 36 L4 32 L29 28 Z"
        fill="currentColor"
      />
    </svg>
  );
}
