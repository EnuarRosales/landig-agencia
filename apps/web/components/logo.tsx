/**
 * Mocter wordmark as pure SVG: a white gradient chip (in the spirit of the
 * original AgencIA chip) holding an "M" mark, followed by the word "Mocter".
 *
 * The wordmark renders with the Sora display font through the CSS variable
 * exposed by `next/font`, so it adapts to any theme through `currentColor`.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 148 40"
      role="img"
      aria-label="Mocter"
      className={className}
    >
      <defs>
        <linearGradient id="mocter-chip-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f6bff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      {/* Chip */}
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="12"
        fill="#fff"
        stroke="rgba(0,0,0,0.08)"
      />
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="12"
        fill="url(#mocter-chip-glow)"
        opacity="0.16"
      />
      {/* M mark: rounded strokes in the brand gradient. */}
      <path
        d="M10 30V12.5L20 24l10-11.5V30"
        fill="none"
        stroke="url(#mocter-chip-glow)"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wordmark (Sora via CSS variable) */}
      <text
        x="48"
        y="28"
        fontFamily="var(--font-sora), ui-sans-serif, system-ui, sans-serif"
        fontWeight="800"
        fontSize="24"
        letterSpacing="-0.8"
        fill="currentColor"
      >
        Mocter
      </text>
    </svg>
  );
}
