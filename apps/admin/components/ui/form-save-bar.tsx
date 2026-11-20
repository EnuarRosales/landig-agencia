"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { FormSaveBar as UiFormSaveBar, type FormSaveBarProps as UiFormSaveBarProps } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface FormSaveBarProps extends Omit<UiFormSaveBarProps, "locale" | "onNavigate"> {
  /** Idioma activo (`es` | `en`). */
  locale?: AdminLocale;
}

/**
 * Adaptador compatible de `FormSaveBar` (`@mocter/ui`) conectado a `next/navigation` e i18n de `apps/admin`.
 */
export function FormSaveBar({ locale = "es", labels, ...props }: FormSaveBarProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale).workspace;

  return (
    <UiFormSaveBar
      locale={locale}
      onNavigate={(href) => router.push(href)}
      labels={{
        saveBarUnsavedChanges: dict.saveBarUnsavedChanges,
        saveBarPendingOne: dict.saveBarPendingOne,
        saveBarPendingMany: dict.saveBarPendingMany,
        saveBarSaveCta: dict.saveBarSaveCta,
        saveBarSavingCta: dict.saveBarSavingCta,
        saveBarDiscardCta: dict.saveBarDiscardCta,
        saveBarModalTitle: dict.saveBarModalTitle,
        saveBarModalSubtitle: dict.saveBarModalSubtitle,
        saveBarModalWarning: dict.saveBarModalWarning,
        saveBarModalConfirmDiscard: dict.saveBarModalConfirmDiscard,
        saveBarModalKeepEditing: dict.saveBarModalKeepEditing,
        saveBarModalDetailSection: dict.saveBarModalDetailSection,
        ...labels,
      }}
      {...props}
    />
  );
}
