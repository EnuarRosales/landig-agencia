/**
 * Fixed decorative background: three drifting mesh blobs plus a faded grid
 * overlay (ports the original `.mesh` / `.grid-overlay` styles).
 */
export function FloatingBackground() {
  return (
    <>
      <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div
          className="mesh-blob opacity-50"
          style={{
            width: 520,
            height: 520,
            background: "var(--color-a1)",
            top: -120,
            left: -80,
          }}
        />
        <div
          className="mesh-blob opacity-50"
          style={{
            width: 480,
            height: 480,
            background: "var(--color-a2)",
            bottom: -140,
            right: -60,
            animationDelay: "-6s",
          }}
        />
        <div
          className="mesh-blob opacity-35"
          style={{
            width: 420,
            height: 420,
            background: "var(--color-a3)",
            top: "40%",
            left: "55%",
            animationDelay: "-12s",
          }}
        />
      </div>
      <div
        className="grid-overlay pointer-events-none fixed inset-0 -z-10"
        aria-hidden
      />
    </>
  );
}
