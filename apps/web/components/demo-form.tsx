"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import {
  demoRequestInitialState,
  submitDemoRequest,
} from "@/app/actions/demo-request";

const fieldClasses =
  "w-full rounded-xl border border-stroke bg-[rgba(255,255,255,0.04)] px-4 py-3 text-[15px] text-txt placeholder:text-muted focus:border-a2 focus:outline-none";

function FieldError({ message }: { message: string | undefined }) {
  return message ? <p className="mt-1 text-[13px] text-hot">{message}</p> : null;
}

export function DemoForm() {
  const t = useTranslations("form");
  const [state, formAction, pending] = useActionState(
    submitDemoRequest,
    demoRequestInitialState,
  );

  if (state.status === "success") {
    return (
      <div
        id="demo-form"
        className="flex flex-col items-center gap-3 rounded-3xl border border-[rgba(47,212,131,0.4)] bg-[rgba(47,212,131,0.08)] px-8 py-12 text-center"
        role="status"
      >
        <p className="font-display text-[24px] font-bold tracking-tight">
          {t("successTitle")}
        </p>
        <p className="max-w-[420px] text-muted">{t("successText")}</p>
        <form action={formAction}>
          <button
            type="submit"
            className="rounded-full border border-stroke px-5 py-2 text-[14px] font-semibold text-txt transition-colors hover:border-a2"
          >
            {t("successAgain")}
          </button>
        </form>
      </div>
    );
  }

  const messageError = state.fieldErrors.message;

  return (
    <div
      id="demo-form"
      className="mx-auto rounded-3xl border border-stroke bg-surface p-8 backdrop-blur-[10px]"
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="lead-name" className="mb-1 block text-[14px] font-medium">
              {t("name")}
            </label>
            <input
              id="lead-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              aria-invalid={Boolean(state.fieldErrors.name)}
              className={
                fieldClasses +
                (state.fieldErrors.name ? " border-hot" : "")
              }
            />
            <FieldError message={state.fieldErrors.name ? t("errRequired") : undefined} />
          </div>
          <div>
            <label htmlFor="lead-email" className="mb-1 block text-[14px] font-medium">
              {t("email")}
            </label>
            <input
              id="lead-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              aria-invalid={Boolean(state.fieldErrors.email)}
              className={
                fieldClasses +
                (state.fieldErrors.email ? " border-hot" : "")
              }
            />
            <FieldError
              message={
                state.fieldErrors.email
                  ? state.fieldErrors.email === "required"
                    ? t("errRequired")
                    : t("errEmail")
                  : undefined
              }
            />
          </div>
          <div>
            <label htmlFor="lead-phone" className="mb-1 block text-[14px] font-medium">
              {t("phone")}
            </label>
            <input
              id="lead-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder={t("phonePlaceholder")}
              aria-invalid={Boolean(state.fieldErrors.phone)}
              className={
                fieldClasses +
                (state.fieldErrors.phone ? " border-hot" : "")
              }
            />
            <FieldError
              message={
                state.fieldErrors.phone
                  ? state.fieldErrors.phone === "required"
                    ? t("errRequired")
                    : t("errPhone")
                  : undefined
              }
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="lead-message" className="mb-1 block text-[14px] font-medium">
              {t("message")}
            </label>
            <textarea
              id="lead-message"
              name="message"
              rows={3}
              placeholder={t("messagePlaceholder")}
              className={fieldClasses}
            />
            <FieldError message={messageError ? t("errUnknown") : undefined} />
          </div>
        </div>

        {state.reason ? (
          <p role="alert" className="text-[14px] text-hot">
            {state.reason === "db" ? t("errDb") : t("errUnknown")}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-a1),var(--color-a2))] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_8px_30px_rgba(47,107,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(47,107,255,0.6)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {pending ? t("sending") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
