"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Feature card with the cursor-following hover glow of the original design.
 * Server components pass the icon as a JSX prop so the icon stays
 * server-rendered.
 */
export function FeatureCard({
  icon,
  title,
  text,
  tag,
  featured,
}: {
  icon: ReactNode;
  title: string;
  text: ReactNode;
  tag?: ReactNode;
  featured?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-show");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`reveal feat-glow relative overflow-hidden rounded-[26px] border border-stroke bg-surface p-9 backdrop-blur-[10px] transition-all duration-300 hover:-translate-y-1.5 hover:border-[rgba(47,107,255,0.5)] ${
        featured
          ? "bg-[linear-gradient(155deg,rgba(47,107,255,.14),rgba(34,211,238,.06)),var(--color-surface)]"
          : ""
      }`}
    >
      <div className="relative mb-[22px] grid h-[60px] w-[60px] place-items-center rounded-2xl border border-stroke bg-[linear-gradient(145deg,rgba(47,107,255,.25),rgba(34,211,238,.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
        <span className="text-[#dff0ff]">{icon}</span>
      </div>
      <h3 className="mb-2.5 font-display text-[clamp(20px,2.4vw,26px)] tracking-tight">
        {title}
      </h3>
      <p className="text-[15.5px] text-muted">{text}</p>
      {tag ? (
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,211,238,.25)] bg-[rgba(34,211,238,.08)] px-3 py-[5px] text-[12px] font-semibold text-a2">
          {tag}
        </span>
      ) : null}
    </div>
  );
}
