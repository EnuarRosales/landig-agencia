import { useTranslations } from "next-intl";
import {
  IconBolt,
  IconCalendar,
  IconShield,
  IconWhatsappFilled,
} from "../icons";

/** Small "M" avatar mark used inside the WhatsApp phone header. */
function AssistantAvatar() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
      <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="wa-avatar-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2f6bff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path
          d="M10 30V12.5L20 24l10-11.5V30"
          fill="none"
          stroke="url(#wa-avatar-g)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function FloatingBadge({
  position,
  delay,
  icon,
  title,
  sub,
}: {
  position: string;
  delay: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div
      className={`absolute z-10 hidden min-[560px]:flex ${position} items-center gap-2.5 rounded-2xl border border-stroke bg-surface px-4 py-3 text-[13px] shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-[12px] float-badge`}
      style={{ animationDelay: delay }}
    >
      <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-[linear-gradient(135deg,rgba(47,107,255,.18),rgba(34,211,238,.12))] dark:bg-[linear-gradient(135deg,rgba(47,107,255,.3),rgba(34,211,238,.2))] text-a1 dark:text-white">
        {icon}
      </span>
      <span>
        <b className="block bg-[linear-gradient(90deg,var(--color-a2),var(--color-a1))] bg-clip-text text-[16px] text-transparent">
          {title}
        </b>
        <small className="text-[11px] text-muted">{sub}</small>
      </span>
    </div>
  );
}

export function Hero() {
  const t = useTranslations("hero");

  const trust = [
    { icon: <IconCalendar className="h-4 w-4" />, before: t("trust1a"), bold: t("trust1b"), after: "" },
    { icon: <IconShield className="h-4 w-4" />, before: t("trust2a"), bold: t("trust2b"), after: "" },
    { icon: <IconBolt className="h-4 w-4" />, before: "", bold: t("trust3b"), after: t("trust3c") },
  ];

  const messages = [
    {
      kind: "out",
      text: t("chat.out1"),
      time: t("chat.out1Time"),
      delay: "0.4s",
      key: "out1",
    },
    {
      kind: "in",
      text: t("chat.in1"),
      time: t("chat.in1Time"),
      delay: "1.3s",
      key: "in1",
    },
    {
      kind: "out",
      text: t("chat.out2"),
      time: t("chat.out2Time"),
      delay: "2.2s",
      key: "out2",
    },
  ] as const;

  return (
    <header className="relative flex min-h-screen flex-wrap items-center gap-x-12 gap-y-8 px-[clamp(18px,5vw,60px)] pb-16 pt-[120px]">
      <div className="mx-auto w-full max-w-[660px] lg:mx-0 lg:flex-1 lg:min-w-[340px]">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-4 py-[7px] text-[13px] text-muted">
          <span
            className="h-2 w-2 rounded-full bg-wa shadow-[0_0_10px_var(--color-wa)]"
            style={{ animation: "pulse-dot 1.6s infinite" }}
          />
          {t("pill")}
        </span>

        <h1 className="mb-5 text-[clamp(38px,6vw,66px)] font-extrabold leading-[1.06] tracking-tight font-display">
          {t("titleStart")}
          <span className="bg-[linear-gradient(100deg,var(--color-a2),var(--color-a1)_55%,var(--color-a3))] bg-clip-text text-transparent">
            {t("titleAccent")}
          </span>
          {t("titleEnd")}
        </h1>

        <p className="copy mb-8 max-w-[580px] text-[clamp(17px,2vw,20px)] text-muted">
          {t.rich("lead", {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>

        <div className="mb-8 flex flex-wrap gap-3.5">
          <a
            href="#demo-form"
            className="inline-flex items-center gap-2 rounded-full bg-wa px-6 py-3 font-semibold text-[15px] text-wa-ink transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_34px_rgba(37,211,102,0.5)]"
          >
            <IconWhatsappFilled className="h-[18px] w-[18px]" />
            {t("ctaPrimary")}
          </a>
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-6 py-3 font-semibold text-[15px] text-txt transition-all hover:-translate-y-0.5 hover:border-a2"
          >
            {t("ctaSecondary")}
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-[13px] text-muted">
          {trust.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              <span className="text-a2">{item.icon}</span>
              {item.before}
              <b className="font-semibold text-txt">{item.bold}</b>
              {item.after}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mx-auto flex min-w-[320px] max-w-full flex-1 justify-center">
        <FloatingBadge
          position="-left-1 top-5"
          delay="0s"
          icon={<IconCalendar className="h-[18px] w-[18px]" />}
          title={t("badges.b1title")}
          sub={t("badges.b1sub")}
        />
        <FloatingBadge
          position="-right-1 bottom-16"
          delay="-3s"
          icon={<IconBolt className="h-[18px] w-[18px]" />}
          title={t("badges.b2title")}
          sub={t("badges.b2sub")}
        />

        <div className="relative w-[330px] max-w-[88vw] rounded-[38px] border border-stroke bg-[linear-gradient(160deg,#0d1324,#080b16)] p-3.5 shadow-[0_40px_90px_rgba(0,0,0,0.6),0_0_60px_rgba(47,107,255,0.4)]">
          {/* Notch */}
          <div className="absolute left-1/2 top-4 h-[22px] w-[120px] -translate-x-1/2 rounded-full bg-[#05070f]" />

          {/* WhatsApp header — fixed brand colors, same in both themes */}
          <div className="mt-1.5 flex items-center gap-3 rounded-t-[26px] bg-wa2 px-4 pb-3.5 pt-7">
            <AssistantAvatar />
            <div className="info leading-tight">
              <b className="text-[15px] text-[#eaf0ff]">{t("assistant.name")}</b>
              <br />
              <span className="text-[12px] text-[#c8f5e0]">{t("assistant.status")}</span>
            </div>
          </div>

          {/* Chat body */}
          <div className="flex min-h-[360px] flex-col gap-2.5 bg-[#0b141a] px-3.5 py-4.5">
            {messages.map((msg) => (
              <div
                key={msg.key}
                className={`chat-msg max-w-[82%] rounded-[14px] px-3.5 py-2 text-[14px] leading-snug ${
                  msg.kind === "in"
                    ? "self-start rounded-tl-[4px] bg-[#1f2c34] text-[#eaf0ff]"
                    : "self-end rounded-tr-[4px] bg-[#005c4b] text-[#eaf0ff]"
                }`}
                style={{ animationDelay: msg.delay }}
              >
                {msg.text}
                <span
                  className={`chat-msg-time ${
                    msg.kind === "out" ? "text-[#9fd9c6]" : "text-[#778a9d]"
                  }`}
                >
                  {msg.time}
                </span>
              </div>
            ))}

            {/* Typing indicator */}
            <div
              className="chat-msg flex items-center gap-1 self-start rounded-[14px] bg-[#1f2c34] px-4 py-3"
              style={{ animationDelay: "2.9s", animationDuration: "0.4s" }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[7px] w-[7px] rounded-full bg-[#88a4ab]"
                  style={{
                    animation: "typing-blink 1.2s infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>

            {[
              { text: t("chat.in2"), time: t("chat.in2Time"), delay: "3.4s", key: "in2" },
              { text: t("chat.in3"), time: t("chat.in3Time"), delay: "4.4s", key: "in3" },
            ].map((msg) => (
              <div
                key={msg.key}
                className="chat-msg max-w-[82%] self-start rounded-[14px] rounded-tl-[4px] bg-[#1f2c34] px-3.5 py-2 text-[14px] leading-snug text-[#eaf0ff]"
                style={{ animationDelay: msg.delay }}
              >
                {msg.text}
                <span className="chat-msg-time text-[#778a9d]">{msg.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
