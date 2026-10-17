"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      id="glow"
      aria-hidden
      className="pointer-events-none fixed z-0 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 mix-blend-screen transition-opacity duration-300"
      style={{
        background:
          "radial-gradient(circle, rgba(47,107,255,0.14), transparent 65%)",
      }}
    />
  );
}

/**
 * Fixed decorative background: three drifting mesh blobs plus a faded grid
 * overlay (ports the original `.mesh` / `.grid-overlay` styles) and the cursor glow.
 */
export function FloatingBackground() {
  return (
    <>
      <CursorGlow />
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
