import { useTranslations } from "next-intl";
import { CountUp } from "../count-up";
import { Reveal } from "../reveal";
import { IconArrow, IconBolt, IconSpark } from "../icons";

type StageColor =
  | { dot: "bg-cold"; text: "text-cold"; border: "border-[rgba(90,169,255,.35)]" }
  | { dot: "bg-warm"; text: "text-warm"; border: "border-[rgba(255,182,61,.35)]" }
  | { dot: "bg-hot"; text: "text-hot"; border: "border-[rgba(255,107,87,.4)]" }
  | { dot: "bg-a1"; text: "text-a3"; border: "border-[rgba(47,107,255,.4)]" }
  | { dot: "bg-done"; text: "text-done"; border: "border-[rgba(47,212,131,.4)]" };

const STAGES: { labelKey: string; value: number }[] = [
  { labelKey: "cold", value: 128 },
  { labelKey: "warm", value: 74 },
  { labelKey: "hot", value: 46 },
  { labelKey: "order", value: 31 },
  { labelKey: "done", value: 27 },
];

function StageDot({ color }: { color: StageColor }) {
  const bg = color.dot;
  return <span className={`h-[9px] w-[9px] rounded-full ${bg}`} />;
}

export function LiveDemo() {
  const t = useTranslations("demo");
  const p = useTranslations("demo.pipeline");
  const labels = useTranslations("demo.inbox.labels");
  const convs = useTranslations("demo.inbox.conversations");
  const chat = useTranslations("demo.inbox.chat");
  const top = useTranslations("demo.inbox.chatTop");
  const ctx = useTranslations("demo.inbox.ctx");

  const conversations = [
    {
      initials: "C1",
      avatar: "linear-gradient(135deg,#ff6b57,#ff9686)",
      time: convs("c1time"),
      name: convs("c1name"),
      preview: convs("c1preview"),
      label: "hot",
      selected: true,
    },
    {
      initials: "C2",
      avatar: "linear-gradient(135deg,#2f6bff,#4aa3ff)",
      time: convs("c2time"),
      name: convs("c2name"),
      preview: convs("c2preview"),
      label: "order",
      selected: false,
    },
    {
      initials: "C3",
      avatar: "linear-gradient(135deg,#ffb63d,#ffcd73)",
      time: convs("c3time"),
      name: convs("c3name"),
      preview: convs("c3preview"),
      label: "warm",
      selected: false,
    },
    {
      initials: "C4",
      avatar: "linear-gradient(135deg,#2fd483,#77e6b0)",
      time: convs("c4time"),
      name: convs("c4name"),
      preview: convs("c4preview"),
      label: "done",
      selected: false,
    },
  ] as const;

  const labelBadge = (label: (typeof conversations)[number]["label"]) => {
    const styles: Record<string, string> = {
      hot: "border-0 bg-[rgba(255,107,87,.14)] text-[#ff9686]",
      warm: "border-0 bg-[rgba(255,182,61,.14)] text-[#ffcd73]",
      order: "border-0 bg-[rgba(47,107,255,.14)] text-[#9cc0ff]",
      done: "border-0 bg-[rgba(47,212,131,.14)] text-[#77e6b0]",
    };
    const dot: Record<string, string> = {
      hot: "bg-hot",
      warm: "bg-warm",
      order: "bg-a1",
      done: "bg-done",
    };
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-[2px] text-[11px] font-semibold ${styles[label]}`}
      >
        <span className={`h-[7px] w-[7px] rounded-full ${dot[label]}`} />
        {labels(label)}
      </span>
    );
  };

  return (
    <section
      id="demo"
      className="relative px-[clamp(18px,5vw,60px)] py-[clamp(70px,10vw,120px)]"
    >
      <Reveal>
        <div className="eyebrow">{t("eyebrow")}</div>
        <h2 className="mx-auto mb-4 max-w-[860px] text-center font-display text-[clamp(28px,4.5vw,46px)] font-extrabold leading-[1.1] tracking-tight">
          {t("title")}
        </h2>
        <p className="copy mx-auto mb-14 max-w-[660px] text-center text-[17px] text-muted">
          {t("sub")}
        </p>
      </Reveal>

      <div className="mx-auto max-w-[1180px]">
        {/* Pipeline */}
        <Reveal>
          <div className="mb-8 flex flex-wrap justify-center gap-3">
            {STAGES.map((stage, i) => (
              <div
                key={stage.labelKey}
                className={`relative min-w-[150px] flex-1 rounded-2xl border bg-surface px-[18px] py-4 transition-transform duration-300 hover:-translate-y-1 ${STAGE_BORDERS[i]}`}
              >
                <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
                  <StageDot color={STAGE_COLORS[i]} />
                  {p(stage.labelKey)}
                </div>
                <div className={`font-display text-[26px] font-extrabold ${STAGE_TEXT[i]}`}>
                  <CountUp value={stage.value} />
                </div>
                {i < STAGES.length - 1 ? (
                  <span className="absolute right-[-13px] top-1/2 z-10 hidden -translate-y-1/2 text-muted lg:block">
                    <IconArrow className="h-[22px] w-[22px]" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Reveal>

        {/* Inbox mockup */}
        <Reveal>
          <div className="overflow-hidden rounded-[22px] border border-stroke bg-[#0b1020] shadow-[0_40px_90px_rgba(0,0,0,0.5)] lg:grid lg:grid-cols-[290px_1fr_240px]">
            {/* List column */}
            <div className="hidden border-r border-stroke2 lg:block">
              <div className="flex items-center justify-between border-b border-stroke2 bg-[rgba(255,255,255,0.02)] px-[18px] py-4">
                <b className="text-[14px] text-[#eaf0ff]">{t("inbox.head")}</b>
                <div className="flex gap-2 text-[11px] text-[#9aa6c4]">
                  <i className="rounded-lg bg-[rgba(47,107,255,0.2)] px-2 py-[3px] not-italic text-[#cfe0ff]">
                    {t("inbox.chipAll")}
                  </i>
                  <i className="rounded-lg bg-[rgba(255,255,255,0.06)] px-2 py-[3px] not-italic">
                    {t("inbox.chipUnassigned")}
                  </i>
                </div>
              </div>
              {conversations.map((conv) => (
                <div
                  key={conv.initials}
                  className={`flex gap-3 border-b border-stroke2 px-4 py-3.5 transition-colors ${
                    conv.selected ? "bg-[rgba(47,107,255,0.08)]" : "hover:bg-[rgba(47,107,255,0.08)]"
                  }`}
                >
                  <span
                    className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                    style={{ background: conv.avatar }}
                  >
                    {conv.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold text-[#eaf0ff]">
                        {conv.name}
                      </span>
                      <span className="text-[11px] text-[#9aa6c4]">{conv.time}</span>
                    </div>
                    <p className="mb-1.5 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] text-[#9aa6c4]">
                      {conv.preview}
                    </p>
                    {labelBadge(conv.label)}
                  </div>
                </div>
              ))}
            </div>

            {/* Chat column */}
            <div className="flex min-h-[260px] flex-col bg-[#0a0f1e]">
              <div className="flex items-center gap-3 border-b border-stroke2 px-[18px] py-3.5">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#ff6b57,#ff9686)" }}
                >
                  C1
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-[#eaf0ff]">{top("name")}</div>
                  <div className="text-[11px] text-wa">{top("status")}</div>
                </div>
                <span className="ml-auto rounded-lg border border-[rgba(47,212,131,0.3)] px-3 py-[5px] text-[11px] text-done">
                  {top("resolve")}
                </span>
              </div>

              <div className="flex min-h-[260px] flex-1 flex-col gap-2.5 px-[18px] py-[18px]">
                {[
                  { kind: "in", text: chat("m1"), time: chat("m1Time"), key: "m1" },
                  { kind: "out", text: chat("m2"), time: chat("m2Time"), key: "m2" },
                  { kind: "out", text: chat("m3"), time: chat("m3Time"), key: "m3" },
                ].map((msg) => (
                  <div
                    key={msg.key}
                    className={`max-w-[78%] rounded-[14px] px-3.5 py-2 text-[13.5px] leading-snug ${
                      msg.kind === "in"
                        ? "self-start rounded-tl-[4px] bg-[#1a2436] text-[#eaf0ff]"
                        : "self-end rounded-tr-[4px] bg-[linear-gradient(135deg,rgba(47,107,255,.9),rgba(34,211,238,.75))] font-medium text-[#04121f]"
                    }`}
                  >
                    {msg.text}
                    <span className="chat-msg-time opacity-65">
                      {msg.time}
                    </span>
                  </div>
                ))}

                <div className="self-center rounded-lg bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[11px] text-[#9aa6c4]">
                  {chat("sys")}
                </div>

                {[
                  { kind: "in", text: chat("m4"), time: chat("m4Time"), key: "m4" },
                  { kind: "out", text: chat("m5"), time: chat("m5Time"), key: "m5" },
                ].map((msg) => (
                  <div
                    key={msg.key}
                    className={`max-w-[78%] rounded-[14px] px-3.5 py-2 text-[13.5px] leading-snug ${
                      msg.kind === "in"
                        ? "self-start rounded-tl-[4px] bg-[#1a2436] text-[#eaf0ff]"
                        : "self-end rounded-tr-[4px] bg-[linear-gradient(135deg,rgba(47,107,255,.9),rgba(34,211,238,.75))] font-medium text-[#04121f]"
                    }`}
                  >
                    {msg.text}
                    <span className="chat-msg-time opacity-65">{msg.time}</span>
                  </div>
                ))}
              </div>

              <div className="mx-[18px] mb-[18px] flex items-center gap-2 rounded-xl border border-stroke2 bg-[rgba(255,255,255,0.04)] px-3.5 py-2.5 text-[12.5px] text-[#9aa6c4]">
                {t("inbox.input")}
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,var(--color-a2),var(--color-a1))] px-2.5 py-1 text-[11px] font-semibold text-[#04121f]">
                  <IconSpark className="h-[13px] w-[13px]" />
                  {t("inbox.aiTag")}
                </span>
              </div>
            </div>

            {/* Context column */}
            <div className="hidden bg-[rgba(255,255,255,0.015)] px-[18px] py-[18px] lg:block">
              <div className="mb-5">
                <p className="mb-2.5 text-[12px] uppercase tracking-[0.08em] text-[#9aa6c4]">
                  {ctx("contactState")}
                </p>
                <div className="mb-2 flex items-center justify-between rounded-[10px] border border-stroke2 bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[13px] text-[#9aa6c4]">
                  <span>{ctx("stageLabel")}</span>
                  <span className="font-semibold text-[#ff9686]">{ctx("stageValue")}</span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] border border-stroke2 bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[13px] text-[#9aa6c4]">
                  <span>{ctx("priorityLabel")}</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-hot">
                    <IconBolt className="h-3.5 w-3.5" />
                    {ctx("priorityValue")}
                  </span>
                </div>
              </div>

              <div className="mb-5">
                <p className="mb-2.5 text-[12px] uppercase tracking-[0.08em] text-[#9aa6c4]">
                  {ctx("tagsHeading")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {labelBadge("hot")}
                  {labelBadge("order")}
                </div>
              </div>

              <div className="mb-5">
                <p className="mb-2.5 text-[12px] uppercase tracking-[0.08em] text-[#9aa6c4]">
                  {ctx("managedHeading")}
                </p>
                <div className="mb-2 flex items-center justify-between rounded-[10px] border border-stroke2 bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[13px] text-[#9aa6c4]">
                  <span>{ctx("assistantLabel")}</span>
                  <span className="font-semibold text-[#9cc0ff]">{ctx("assistantValue")}</span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] border border-stroke2 bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[13px] text-[#9aa6c4]">
                  <span>{ctx("followupLabel")}</span>
                  <span className="font-semibold text-[#77e6b0]">{ctx("followupValue")}</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const STAGE_BORDERS = [
  "border-[rgba(90,169,255,.35)]",
  "border-[rgba(255,182,61,.35)]",
  "border-[rgba(255,107,87,.4)]",
  "border-[rgba(47,107,255,.4)]",
  "border-[rgba(47,212,131,.4)]",
] as const;

const STAGE_COLORS: StageColor[] = [
  { dot: "bg-cold", text: "text-cold", border: "border-[rgba(90,169,255,.35)]" },
  { dot: "bg-warm", text: "text-warm", border: "border-[rgba(255,182,61,.35)]" },
  { dot: "bg-hot", text: "text-hot", border: "border-[rgba(255,107,87,.4)]" },
  { dot: "bg-a1", text: "text-a3", border: "border-[rgba(47,107,255,.4)]" },
  { dot: "bg-done", text: "text-done", border: "border-[rgba(47,212,131,.4)]" },
];

const STAGE_TEXT = ["text-cold", "text-warm", "text-hot", "text-a3", "text-done"] as const;
