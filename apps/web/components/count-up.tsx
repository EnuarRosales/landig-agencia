"use client";

import { useEffect, useRef } from "react";

/**
 * Animated counter for the pipeline stages: counts up once when the element
 * becomes visible (mirrors the original landing's counter observer).
 */
export function CountUp({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);

          const end = value;
          let current = 0;
          const step = end / 45;
          let raf = 0;

          const tick = () => {
            current += step;
            if (current >= end) {
              el.textContent = String(Math.round(end));
              return;
            }
            el.textContent = String(Math.round(current));
            raf = requestAnimationFrame(tick);
          };

          tick();
          return () => cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.5 },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      // Reset text for strict-mode double renders; use the captured `el`
      // because `ref.current` may have changed by cleanup time.
      el.textContent = "0";
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      0
    </span>
  );
}
