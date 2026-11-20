"use client";

import React, { useState } from "react";
import { Clock, RotateCcw, MessageSquareText } from "lucide-react";
import type {
  BotDefaultMessageKey,
  TenantBotDefaultMessages,
  TenantBusinessHours,
} from "@mocter/domain";
import { Button, Card, Checkbox, Input, Label } from "@mocter/ui";
import { AiEnhanceTextarea } from "@/components/ai-enhance-textarea";
import { ConfirmationModal } from "@/components/confirmation-modal";
import type { getAdminDictionary } from "@/lib/i18n";

export interface BotMessagesTabProps {
  dict: ReturnType<typeof getAdminDictionary>["workspace"];
  locale: "es" | "en";
  readOnly: boolean;
  countryCode: string;
  defaultMessages: TenantBotDefaultMessages;
  onDefaultMessagesChange: (next: TenantBotDefaultMessages) => void;
  businessHours: TenantBusinessHours;
  onBusinessHoursChange: (next: TenantBusinessHours) => void;
  onResetDefaults: () => void;
  promptContext: Record<string, unknown>;
}

const MESSAGE_VARIABLES: Record<BotDefaultMessageKey, string[]> = {
  welcome: ["{{business_name}}"],
  out_of_hours: ["{{business_name}}", "{{business_hours_summary}}"],
  order_confirmation: [
    "{{customer_name}}",
    "{{order_code}}",
    "{{order_total}}",
    "{{customer_phone}}",
    "{{shipping_summary}}",
  ],
  dispatch_tracking: [
    "{{customer_name}}",
    "{{order_code}}",
    "{{tracking_code}}",
    "{{shipping_summary}}",
  ],
  delivery_issue: ["{{customer_name}}", "{{order_code}}", "{{customer_phone}}"],
  handoff: ["{{business_name}}", "{{customer_name}}"],
};

const DAYS_ORDER: Array<keyof TenantBusinessHours["schedule"]> = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const DAY_LABELS_ES: Record<keyof TenantBusinessHours["schedule"], string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const DAY_LABELS_EN: Record<keyof TenantBusinessHours["schedule"], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Pestaña de Mensajes Automáticos del Bot y Horario de Atención Internacional.
 */
export function BotMessagesTab({
  dict,
  locale,
  readOnly,
  countryCode,
  defaultMessages,
  onDefaultMessagesChange,
  businessHours,
  onBusinessHoursChange,
  onResetDefaults,
  promptContext,
}: BotMessagesTabProps) {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const messageMeta: Array<{
    key: BotDefaultMessageKey;
    label: string;
    aiFieldKey: string;
  }> = [
    { key: "welcome", label: dict.botMsgGreeting, aiFieldKey: "bot.msg.welcome" },
    { key: "out_of_hours", label: dict.botMsgAway, aiFieldKey: "bot.msg.out_of_hours" },
    {
      key: "order_confirmation",
      label: dict.botMsgOrderConfirmed,
      aiFieldKey: "bot.order_confirmation_message",
    },
    {
      key: "dispatch_tracking",
      label: dict.botMsgDispatched,
      aiFieldKey: "bot.msg.dispatch_tracking",
    },
    {
      key: "delivery_issue",
      label: dict.botMsgPaymentPending,
      aiFieldKey: "bot.msg.delivery_issue",
    },
    { key: "handoff", label: dict.botMsgHumanHandoff, aiFieldKey: "bot.msg.handoff" },
  ];

  function updateMessage(
    key: BotDefaultMessageKey,
    patch: { body?: string; enabled?: boolean },
  ) {
    const current = defaultMessages[key] ?? {
      body: "",
      enabled: true,
      updatedAt: new Date().toISOString(),
    };
    onDefaultMessagesChange({
      ...defaultMessages,
      [key]: {
        body: patch.body !== undefined ? patch.body : current.body,
        enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function appendPlaceholder(key: BotDefaultMessageKey, token: string) {
    const currentBody = defaultMessages[key]?.body || "";
    const spacer = currentBody && !currentBody.endsWith(" ") ? " " : "";
    updateMessage(key, { body: `${currentBody}${spacer}${token}` });
  }

  return (
    <div className="space-y-6">
      {/* Mensajes Predeterminados */}
      <Card className="space-y-5 p-5 shadow-xs md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-[var(--dsn-border)] pb-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dsn-accent)]" />
            <div>
              <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                {dict.botMessagesTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                {dict.botMessagesSubtitle}
              </p>
            </div>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmResetOpen(true)}
              className="shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{dict.botResetDefaultsCta}</span>
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {messageMeta.map((item) => {
            const entry = defaultMessages[item.key] ?? {
              body: "",
              enabled: true,
              updatedAt: "",
            };
            const vars = MESSAGE_VARIABLES[item.key];
            return (
              <div
                key={item.key}
                className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/15 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--dsn-text)]">{item.label}</span>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
                    <span>
                      {entry.enabled
                        ? locale === "en"
                          ? "Enabled"
                          : "Activo"
                        : locale === "en"
                          ? "Disabled"
                          : "Inactivo"}
                    </span>
                    <Checkbox
                      disabled={readOnly}
                      checked={entry.enabled}
                      onCheckedChange={(checked) =>
                        updateMessage(item.key, { enabled: checked === true })
                      }
                    />
                  </label>
                </div>

                <AiEnhanceTextarea
                  id={`bot-msg-${item.key}`}
                  fieldKey={item.aiFieldKey}
                  label={item.label}
                  rows={2}
                  disabled={readOnly}
                  locale={locale}
                  value={entry.body}
                  onChange={(body) => updateMessage(item.key, { body })}
                  context={promptContext}
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  {vars.map((token) => (
                    <Button
                      key={token}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={readOnly}
                      onClick={() => appendPlaceholder(item.key, token)}
                      className="h-auto min-h-0 rounded-md px-2 py-0.5 font-mono text-[11px] text-[var(--dsn-accent)] hover:border-[var(--dsn-accent)]"
                    >
                      + {token}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Horarios de Atención */}
      <Card className="space-y-4 p-5 shadow-xs md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-[var(--dsn-border)] pb-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--dsn-accent)]" />
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              {dict.botBusinessHoursTitle}
            </h2>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
            <Checkbox
              disabled={readOnly}
              checked={businessHours.enabled}
              onCheckedChange={(checked) =>
                onBusinessHoursChange({
                  ...businessHours,
                  enabled: checked === true,
                })
              }
            />
            <span>{dict.botBusinessHoursEnabledLabel}</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bot-bh-timezone" className="mb-1.5 block text-xs font-semibold">
              {dict.botBusinessHoursTimezoneLabel}
            </Label>
            <Input
              id="bot-bh-timezone"
              type="text"
              disabled={readOnly}
              value={businessHours.timezone}
              onChange={(e) =>
                onBusinessHoursChange({
                  ...businessHours,
                  timezone: e.target.value,
                })
              }
              placeholder="America/Bogota"
              className="font-mono"
            />
          </div>
          <div className="flex items-end">
            <p className="text-xs text-[var(--dsn-text-secondary)]">
              {locale === "en"
                ? `Store country ISO reference: ${countryCode}`
                : `País ISO de referencia del comercio: ${countryCode}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS_ORDER.map((day) => {
            const slot = businessHours.schedule[day];
            const dayName = locale === "en" ? DAY_LABELS_EN[day] : DAY_LABELS_ES[day];
            return (
              <div
                key={day}
                className="space-y-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/15 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--dsn-text)]">{dayName}</span>
                  <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[var(--dsn-text-secondary)]">
                    <Checkbox
                      disabled={readOnly}
                      checked={!slot.closed}
                      onCheckedChange={(checked) =>
                        onBusinessHoursChange({
                          ...businessHours,
                          schedule: {
                            ...businessHours.schedule,
                            [day]: { ...slot, closed: checked !== true },
                          },
                        })
                      }
                      className="h-3.5 w-3.5"
                    />
                    <span>{locale === "en" ? "Open" : "Abierto"}</span>
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    disabled={readOnly || slot.closed}
                    value={slot.open}
                    onChange={(e) =>
                      onBusinessHoursChange({
                        ...businessHours,
                        schedule: {
                          ...businessHours.schedule,
                          [day]: { ...slot, open: e.target.value },
                        },
                      })
                    }
                    className="h-7 px-1.5 py-1 text-xs"
                  />
                  <span className="text-xs text-[var(--dsn-text-secondary)]">-</span>
                  <Input
                    type="time"
                    disabled={readOnly || slot.closed}
                    value={slot.close}
                    onChange={(e) =>
                      onBusinessHoursChange({
                        ...businessHours,
                        schedule: {
                          ...businessHours.schedule,
                          [day]: { ...slot, close: e.target.value },
                        },
                      })
                    }
                    className="h-7 px-1.5 py-1 text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <ConfirmationModal
        isOpen={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          onResetDefaults();
          setConfirmResetOpen(false);
        }}
        variant="warning"
        title={dict.botResetModalTitle}
        subtitle={dict.botResetModalSubtitle}
        details={[{ label: dict.botBusinessHoursTimezoneLabel, value: countryCode }]}
        warningTitle={dict.botResetModalWarningTitle}
        warningMessage={dict.botResetModalWarningMessage}
        confirmText={dict.botResetModalConfirmCta}
      />
    </div>
  );
}
