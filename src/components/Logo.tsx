/** RABÉ mark: a stylised "R" with a sparkle, on a violet gradient tile. */
export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`logo ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M9 25V7h7.2c3.6 0 6 2.2 6 5.4 0 2.5-1.5 4.3-3.9 5L23 25"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M9 17.6h6.6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        <path
          d="M25.5 3.5l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.2-.8 2.2-.8Z"
          fill="currentColor"
          opacity="0.95"
        />
      </svg>
    </span>
  );
}
