"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Heading3,
  List,
  ListOrdered,
  Link2,
  AlignLeft,
  AlignCenter,
  RemoveFormatting,
  Code2,
  Eye,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Info,
} from "lucide-react";

export interface EmailAiEnhanceResult {
  ok: boolean;
  suggestion?: string;
  error?: string;
}

export interface EmailRichTextEditorProps {
  id?: string;
  label: string;
  fieldKey: string;
  value: string;
  onChange: (html: string) => void;
  locale?: "es" | "en";
  availableVariables?: string[];
  context?: Record<string, unknown>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  minHeightClass?: string;
  onEnhanceRequest?: (fieldKey: string, draft: string) => Promise<EmailAiEnhanceResult>;
}

/**
 * Editor de texto enriquecido (WYSIWYG + modo HTML) con inserción de variables en cursor
 * y mejora asistida «Mejorar con AI» conectada al servicio SaaS (`SPEC-14`, `AGENTS.md §4.7`).
 */
export function EmailRichTextEditor({
  id,
  label,
  fieldKey,
  value,
  onChange,
  locale = "es",
  availableVariables = [],
  context,
  placeholder = "<p>Redacta el contenido del correo...</p>",
  required = false,
  disabled = false,
  minHeightClass = "min-h-[180px]",
  onEnhanceRequest,
}: EmailRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiDraftProposal, setAiDraftProposal] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);

  // Sincroniza contenido externo al nodo contentEditable únicamente cuando difiere del DOM actual
  useEffect(() => {
    if (!sourceMode && editorRef.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value, sourceMode]);

  function emitFromEditable() {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  function runFormatCommand(command: string, commandValue?: string) {
    if (disabled || sourceMode) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitFromEditable();
  }

  function handleApplyLink() {
    const cleanUrl = linkUrl.trim();
    if (!cleanUrl || /^javascript:/i.test(cleanUrl)) {
      setLinkPopoverOpen(false);
      return;
    }
    runFormatCommand("createLink", cleanUrl);
    setLinkPopoverOpen(false);
    setLinkUrl("https://");
  }

  function insertVariableToken(varName: string) {
    const token = `{{${varName}}}`;
    if (sourceMode && textareaRef.current) {
      const ta = textareaRef.current;
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const updated = `${value.slice(0, start)}${token}${value.slice(end)}`;
      onChange(updated);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }

    if (editorRef.current) {
      editorRef.current.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(token);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        emitFromEditable();
        return;
      }
      onChange(`${value}${value ? " " : ""}${token}`);
    }
  }

  async function handleRequestAiEnhance() {
    const draft = value.trim();
    if (!draft) {
      setAiError("Escribe primero un borrador para que la AI pueda mejorarlo.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      if (onEnhanceRequest) {
        const customRes = await onEnhanceRequest(fieldKey, draft);
        if (customRes.ok && customRes.suggestion) {
          setAiSuggestion(customRes.suggestion);
          setAiDraftProposal(customRes.suggestion);
        } else {
          setAiError(customRes.error || "No se pudo obtener una sugerencia de AI.");
        }
        return;
      }

      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey,
          draft,
          locale,
          context: {
            ...context,
            availableVariables,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { suggestion?: string }; detail?: string; error?: string }
        | null;

      if (!res.ok || !json?.ok || !json.data?.suggestion) {
        throw new Error(
          json?.detail ||
            json?.error ||
            "No fue posible generar una mejora con el servicio AI de plataforma.",
        );
      }

      setAiSuggestion(json.data.suggestion);
      setAiDraftProposal(json.data.suggestion);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }

  function handleAcceptAiSuggestion() {
    const clean = aiDraftProposal.trim();
    if (!clean) return;
    onChange(clean);
    if (editorRef.current && !sourceMode) {
      editorRef.current.innerHTML = clean;
    }
    setAiSuggestion(null);
    setAiDraftProposal("");
    setAiError(null);
  }

  return (
    <div className="space-y-2 w-full">
      {/* Cabecera del Editor + Botón Mejorar con AI */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-[var(--dsn-text)]">
          {label}
          {required && <span className="ml-1 text-rose-500">*</span>}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled || aiLoading}
            onClick={() => void handleRequestAiEnhance()}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/12 px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-accent)] transition-colors hover:bg-[var(--dsn-accent)]/20 disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-pulse" : ""}`} />
            <span>{aiLoading ? "Mejorando..." : "Mejorar con AI"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSourceMode((prev) => !prev)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
          >
            {sourceMode ? (
              <>
                <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>Editor Visual</span>
              </>
            ) : (
              <>
                <Code2 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>Código HTML</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Chips de Variables Clickeables */}
      {availableVariables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--dsn-text-secondary)]">
          <Info className="h-3.5 w-3.5 text-[var(--dsn-accent)] shrink-0" />
          <span>Variables disponibles (haz clic para insertar):</span>
          {availableVariables.map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => insertVariableToken(v)}
              className="rounded border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--dsn-accent)] hover:border-[var(--dsn-accent)] transition-colors"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}

      {/* Barra de Herramientas WYSIWYG */}
      {!sourceMode && (
        <div
          role="toolbar"
          aria-label={`Formato de ${label}`}
          className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/70 px-2 py-1.5"
        >
          <button
            type="button"
            title="Negrita"
            aria-label="Negrita"
            disabled={disabled}
            onClick={() => runFormatCommand("bold")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Cursiva"
            aria-label="Cursiva"
            disabled={disabled}
            onClick={() => runFormatCommand("italic")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Subrayado"
            aria-label="Subrayado"
            disabled={disabled}
            onClick={() => runFormatCommand("underline")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--dsn-border)]" aria-hidden="true" />
          <button
            type="button"
            title="Título"
            aria-label="Título"
            disabled={disabled}
            onClick={() => runFormatCommand("formatBlock", "h3")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Lista con Viñetas"
            aria-label="Lista con Viñetas"
            disabled={disabled}
            onClick={() => runFormatCommand("insertUnorderedList")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Lista Numerada"
            aria-label="Lista Numerada"
            disabled={disabled}
            onClick={() => runFormatCommand("insertOrderedList")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--dsn-border)]" aria-hidden="true" />
          <button
            type="button"
            title="Insertar Enlace"
            aria-label="Insertar Enlace"
            disabled={disabled}
            onClick={() => setLinkPopoverOpen((prev) => !prev)}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Alinear a la Izquierda"
            aria-label="Alinear a la Izquierda"
            disabled={disabled}
            onClick={() => runFormatCommand("justifyLeft")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Centrar"
            aria-label="Centrar"
            disabled={disabled}
            onClick={() => runFormatCommand("justifyCenter")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Limpiar Formato"
            aria-label="Limpiar Formato"
            disabled={disabled}
            onClick={() => runFormatCommand("removeFormat")}
            className="rounded p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
          >
            <RemoveFormatting className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Popover inline para insertar URL sin window.prompt */}
      {linkPopoverOpen && !sourceMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://mocter.co/... o {{product_admin_url}}"
            className="flex-1 min-w-[200px] rounded border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-1 text-xs font-mono text-[var(--dsn-text)]"
          />
          <button
            type="button"
            onClick={handleApplyLink}
            className="rounded bg-[var(--dsn-accent)] px-3 py-1 text-xs font-semibold text-white"
          >
            Aplicar Enlace
          </button>
          <button
            type="button"
            onClick={() => setLinkPopoverOpen(false)}
            className="rounded border border-[var(--dsn-border)] px-2.5 py-1 text-xs text-[var(--dsn-text-secondary)]"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Área Editable (Visual WYSIWYG o HTML Crudo) */}
      {sourceMode ? (
        <textarea
          ref={textareaRef}
          id={id}
          rows={8}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden leading-relaxed ${minHeightClass}`}
        />
      ) : (
        <div
          ref={editorRef}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitFromEditable}
          onBlur={emitFromEditable}
          className={`w-full rounded-b-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden leading-relaxed overflow-y-auto [&_a]:text-[var(--dsn-accent)] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${minHeightClass}`}
        />
      )}

      {/* Alerta de Error AI */}
      {aiError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{aiError}</span>
        </div>
      )}

      {/* Caja de Revisión Humana de Sugerencia AI */}
      {aiSuggestion !== null && (
        <div className="rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-surface)] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-accent)]">
              <Sparkles className="h-3.5 w-3.5" />
              Propuesta Sugerida por AI (Revisión Requerida)
            </span>
          </div>
          <textarea
            rows={4}
            value={aiDraftProposal}
            onChange={(e) => setAiDraftProposal(e.target.value)}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-2.5 text-xs font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAiSuggestion(null);
                setAiDraftProposal("");
              }}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1 text-xs font-semibold text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Descartar</span>
            </button>
            <button
              type="button"
              onClick={handleAcceptAiSuggestion}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--dsn-accent-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Aceptar Sugerencia</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
