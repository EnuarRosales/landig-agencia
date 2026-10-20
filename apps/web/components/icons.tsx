import type { SVGProps } from "react";

/**
 * Inline icon set transcribed from the original `index.html` sprite.
 * Only the icons actually used by the landing are kept. Every icon inherits
 * `currentColor` and is sized via the `size` utility classes on the caller.
 */

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      <path d="M9 14.5l2 2 4-4" />
    </svg>
  );
}

export function IconBot(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V3.5M9 3.5h6" />
      <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M1.5 12v3M22.5 12v3" />
    </svg>
  );
}

export function IconCart(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 3h2l2.4 12.5a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.5-1.2L21.5 7H6" />
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="17.5" cy="20" r="1.4" />
    </svg>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M4 17l4.5-4.5 3 3L16 11l4 4.5" />
    </svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2.5L4.5 13.5H11l-.5 8L19 10.5H12.5z" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 15l6-6" />
      <path d="M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-2 2" />
      <path d="M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l2-2" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5" />
    </svg>
  );
}

export function IconRocket(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 15c-1.5 1-2 4-2 4s3-.5 4-2c.8-.8.9-2 .2-2.8s-1.6-.6-2.2-.2z" />
      <path d="M9 13.5c5-5 8-6 11-6 0 3-1 6-6 11l-3-1z" />
      <path d="M14 8.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" />
    </svg>
  );
}

export function IconWhatsappFilled(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      {...props}
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.16c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.8-4.17-4.94-4.36-.15-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36l.56.01c.18 0 .42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.29.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.18-.28.36-.23.61-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.33.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

export function IconHeartPulse(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5c0 .8-.2 1.6-.5 2.3" />
      <path d="M8 12h2l1.5-3 2 5 1.2-2H19" />
    </svg>
  );
}

export function IconScissors(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8.2 8.5L20 17M8.2 15.5L20 7" />
    </svg>
  );
}

export function IconScale(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M7 21h10M5 7h14M5 7l-2.5 5a3 3 0 0 0 5 0zM19 7l-2.5 5a3 3 0 0 0 5 0z" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11l8-6 8 6M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function IconCap(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 8.5L12 4l9.5 4.5L12 13z" />
      <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
    </svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 6.5a4.5 4.5 0 0 0-5.9 5.7L3 18.3 5.7 21l6.1-6.1a4.5 4.5 0 0 0 5.7-5.9l-2.7 2.7-2.8-2.8z" />
    </svg>
  );
}

export function IconBag(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
    </svg>
  );
}

export function IconPlate(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function IconDumbbell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" />
    </svg>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <svg
      {...base(props)}
      strokeWidth={2}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg
      {...base(props)}
      strokeWidth={2.4}
    >
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}
