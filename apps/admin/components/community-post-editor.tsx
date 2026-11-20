"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Sparkles,
  Underline,
  Video,
  X,
} from "lucide-react";
import {
  resolveSafeVideoEmbedUrl,
  sanitizeCommunityPostHtml,
} from "@mocter/domain/community-html";
import { Alert, AlertDescription, Button, Input } from "@mocter/ui";
import type { AdminLocale } from "@/lib/i18n";

const MAX_CLIENT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ToolbarCommand {
  key: string;
  label: string;
  command: string;
  value?: string;
  icon: React.ComponentType<{ className?: string }>;
  groupEnd?: boolean;
}

export interface CommunityPostEditorProps {
  valueHtml: string;
  onChangeHtml: (nextHtml: string) => void;
  selectedImageFile: File | null;
  onImageFileChange: (file: File | null) => void;
  existingImageUrl?: string | null;
  onRemoveExistingImage?: () => void;
  videoUrl: string;
  onVideoUrlChange: (nextVideoUrl: string) => void;
  locale: AdminLocale;
  organizationName?: string;
  placeholder: string;
  disabled?: boolean;
  labels: {
    addImageCta: string;
    changeImageCta: string;
    removeImageCta: string;
    imageHint: string;
    addVideoCta: string;
    videoPlaceholder: string;
    applyVideoCta: string;
    removeVideoCta: string;
    linkTextLabel?: string;
    linkTextPlaceholder?: string;
    linkUrlLabel?: string;
  };
}

function formatBytesReadable(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Compositor visual WYSIWYG tipo red social para el Muro de Novedades (`SPEC-15-D11`, `AGENTS.md §4.7`).
 *
 * Incluye formato enriquecido limpio (sin vista HTML crudo), alineaciones, enlaces seguros,
 * incrustación validada de video (YouTube/Vimeo), carga de 1 imagen destacada y «Mejorar con AI».
 */
export function CommunityPostEditor({
  valueHtml,
  onChangeHtml,
  selectedImageFile,
  onImageFileChange,
  existingImageUrl,
  onRemoveExistingImage,
  videoUrl,
  onVideoUrlChange,
  locale,
  organizationName,
  placeholder,
  disabled = false,
  labels,
}: CommunityPostEditorProps) {
  const isEn = locale === "en";
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkText, setLinkText] = useState("");
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const [videoDraftUrl, setVideoDraftUrl] = useState("");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  const previewImageUrl = useMemo(() => {
    if (!selectedImageFile) return null;
    return URL.createObjectURL(selectedImageFile);
  }, [selectedImageFile]);

  useEffect(() => {
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== valueHtml) {
      editorRef.current.innerHTML = valueHtml;
    }
  }, [valueHtml]);

  const videoResolution = useMemo(() => {
    if (!videoUrl.trim()) return null;
    return resolveSafeVideoEmbedUrl(videoUrl);
  }, [videoUrl]);

  const toolbarCommands: ToolbarCommand[] = useMemo(
    () => [
      { key: "bold", label: isEn ? "Bold" : "Negrita", command: "bold", icon: Bold },
      { key: "italic", label: isEn ? "Italic" : "Cursiva", command: "italic", icon: Italic },
      {
        key: "underline",
        label: isEn ? "Underline" : "Subrayado",
        command: "underline",
        icon: Underline,
        groupEnd: true,
      },
      {
        key: "h3",
        label: isEn ? "Heading" : "Título",
        command: "formatBlock",
        value: "h3",
        icon: Heading3,
      },
      {
        key: "ul",
        label: isEn ? "Bulleted List" : "Lista con Viñetas",
        command: "insertUnorderedList",
        icon: List,
      },
      {
        key: "ol",
        label: isEn ? "Numbered List" : "Lista Numerada",
        command: "insertOrderedList",
        icon: ListOrdered,
        groupEnd: true,
      },
      {
        key: "align-left",
        label: isEn ? "Align Left" : "Alinear a la Izquierda",
        command: "justifyLeft",
        icon: AlignLeft,
      },
      {
        key: "align-center",
        label: isEn ? "Align Center" : "Centrar",
        command: "justifyCenter",
        icon: AlignCenter,
      },
      {
        key: "align-right",
        label: isEn ? "Align Right" : "Alinear a la Derecha",
        command: "justifyRight",
        icon: AlignRight,
        groupEnd: true,
      },
    ],
    [isEn],
  );

  function emitEditable() {
    if (editorRef.current) {
      onChangeHtml(editorRef.current.innerHTML);
    }
  }

  function captureSelection(): string {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) {
      return "";
    }
    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      return "";
    }
    savedRangeRef.current = range.cloneRange();
    return sel.toString();
  }

  function runCommand(command: string, commandValue?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    emitEditable();
  }

  function handleApplyLink() {
    const clean = linkUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(clean);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Invalid protocol");
      }
    } catch {
      setMediaError(
        isEn
          ? "Enter a valid http:// or https:// link."
          : "Ingresa un enlace válido que comience con http:// o https://.",
      );
      return;
    }

    setMediaError(null);
    const displayText = linkText.trim() || clean;

    const anchor = document.createElement("a");
    anchor.href = parsedUrl.toString();
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer nofollow";
    anchor.textContent = displayText;

    editorRef.current?.focus();
    const sel = window.getSelection();
    if (editorRef.current && sel) {
      let range = savedRangeRef.current;
      if (!range || !editorRef.current.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();
      range.insertNode(anchor);
      const trailingSpace = document.createTextNode(" ");
      anchor.after(trailingSpace);
      const caretRange = document.createRange();
      caretRange.setStartAfter(trailingSpace);
      caretRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(caretRange);
    } else if (editorRef.current) {
      editorRef.current.appendChild(anchor);
      editorRef.current.appendChild(document.createTextNode(" "));
    }

    savedRangeRef.current = null;
    emitEditable();
    setLinkPopoverOpen(false);
    setLinkUrl("https://");
    setLinkText("");
  }

  function handleApplyVideo() {
    const res = resolveSafeVideoEmbedUrl(videoDraftUrl);
    if (!res.ok) {
      setMediaError(res.error);
      return;
    }
    setMediaError(null);
    onVideoUrlChange(videoDraftUrl.trim());
    setVideoPopoverOpen(false);
    setVideoDraftUrl("");
  }

  function handleSelectImageFile(file: File | null | undefined) {
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      setMediaError(
        isEn
          ? "Only JPG, PNG, or WebP images are allowed."
          : "Solo se admiten imágenes en formato JPG, PNG o WebP.",
      );
      return;
    }
    if (file.size > MAX_CLIENT_IMAGE_BYTES) {
      setMediaError(
        isEn
          ? "The image exceeds the 5 MB limit."
          : "La imagen supera el peso máximo de 5 MB.",
      );
      return;
    }
    setMediaError(null);
    onImageFileChange(file);
  }

  async function handleRequestAiEnhance() {
    const plainDraft = (editorRef.current?.innerText ?? valueHtml.replace(/<[^>]+>/g, "")).trim();
    if (!plainDraft) {
      setAiError(
        isEn
          ? "Write a brief draft first so AI can improve it."
          : "Escribe primero un borrador para que la AI pueda mejorarlo.",
      );
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: "community.wall_post",
          draft: valueHtml.trim() || plainDraft,
          locale,
          context: organizationName ? { organizationName } : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { suggestion?: string }; detail?: string; error?: string }
        | null;

      if (!res.ok || !json?.ok || !json.data?.suggestion) {
        throw new Error(
          json?.detail ||
            json?.error ||
            (isEn ? "Could not generate an AI suggestion." : "No se pudo generar una sugerencia de AI."),
        );
      }

      setAiSuggestion(sanitizeCommunityPostHtml(json.data.suggestion));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }

  function handleAcceptAiSuggestion() {
    if (!aiSuggestion) return;
    const clean = sanitizeCommunityPostHtml(aiSuggestion);
    onChangeHtml(clean);
    if (editorRef.current) {
      editorRef.current.innerHTML = clean;
    }
    setAiSuggestion(null);
    setAiError(null);
  }

  const isEditorVisuallyEmpty = !valueHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();

  return (
    <div className="space-y-3">
      {/* Barra de formato WYSIWYG + Acciones multimedia + AI */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)] overflow-hidden focus-within:ring-2 focus-within:ring-[var(--dsn-accent)]/35">
        <div
          role="toolbar"
          aria-label={isEn ? "Post Formatting Toolbar" : "Barra de Formato de Publicación"}
          className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/70 px-2.5 py-2"
        >
          <div className="flex flex-wrap items-center gap-0.5">
            {toolbarCommands.map((item) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.key}>
                  <button
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    disabled={disabled}
                    onClick={() => runCommand(item.command, item.value)}
                    className="rounded-md p-1.5 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)] disabled:opacity-50"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                  {item.groupEnd && (
                    <span className="mx-1 h-4 w-px bg-[var(--dsn-border)]" aria-hidden="true" />
                  )}
                </React.Fragment>
              );
            })}

            <button
              type="button"
              title={isEn ? "Insert Link" : "Insertar Enlace"}
              aria-label={isEn ? "Insert Link" : "Insertar Enlace"}
              disabled={disabled}
              onMouseDown={() => {
                if (!linkPopoverOpen) {
                  const selectedText = captureSelection().trim();
                  if (selectedText) {
                    setLinkText(selectedText);
                  }
                }
              }}
              onClick={() => {
                setVideoPopoverOpen(false);
                if (!linkPopoverOpen) {
                  const selectedText = captureSelection().trim();
                  if (selectedText) {
                    setLinkText(selectedText);
                  }
                }
                setLinkPopoverOpen((v) => !v);
              }}
              className={`rounded-md p-1.5 hover:bg-[var(--dsn-surface)] disabled:opacity-50 ${
                linkPopoverOpen ? "text-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10" : "text-[var(--dsn-text)]"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              title={labels.addVideoCta}
              aria-label={labels.addVideoCta}
              disabled={disabled}
              onClick={() => {
                setLinkPopoverOpen(false);
                setVideoDraftUrl(videoUrl);
                setVideoPopoverOpen((v) => !v);
              }}
              className={`rounded-md p-1.5 hover:bg-[var(--dsn-surface)] disabled:opacity-50 ${
                videoUrl ? "text-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10" : "text-[var(--dsn-text)]"
              }`}
            >
              <Video className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              title={selectedImageFile || existingImageUrl ? labels.changeImageCta : labels.addImageCta}
              aria-label={selectedImageFile || existingImageUrl ? labels.changeImageCta : labels.addImageCta}
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-md p-1.5 hover:bg-[var(--dsn-surface)] disabled:opacity-50 ${
                selectedImageFile || existingImageUrl
                  ? "text-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10"
                  : "text-[var(--dsn-text)]"
              }`}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              title={isEn ? "Clear Formatting" : "Limpiar Formato"}
              aria-label={isEn ? "Clear Formatting" : "Limpiar Formato"}
              disabled={disabled}
              onClick={() => runCommand("removeFormat")}
              className="rounded-md p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] disabled:opacity-50"
            >
              <RemoveFormatting className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            type="button"
            variant="ai"
            size="sm"
            disabled={disabled || aiLoading}
            onClick={() => void handleRequestAiEnhance()}
            className="h-7 min-h-0 px-2.5 text-[11px]"
          >
            <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? "animate-pulse" : ""}`} aria-hidden="true" />
            <span>{aiLoading ? (isEn ? "Enhancing..." : "Mejorando...") : isEn ? "Enhance with AI" : "Mejorar con AI"}</span>
          </Button>
        </div>

        {/* Popover de enlace https (enlace crudo o texto con hipervínculo) */}
        {linkPopoverOpen && (
          <div className="flex flex-col gap-2 border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-[160px] space-y-1">
              <label className="block text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                {labels.linkTextLabel ?? (isEn ? "Link Text (Optional)" : "Texto del Enlace (Opcional)")}
              </label>
              <Input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder={
                  labels.linkTextPlaceholder ??
                  (isEn ? "e.g. View catalog (blank = raw URL)" : "Ej. Ver catálogo (vacío = URL directa)")
                }
                aria-label={labels.linkTextLabel ?? (isEn ? "Link Text (Optional)" : "Texto del Enlace (Opcional)")}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="block text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                {labels.linkUrlLabel ?? (isEn ? "Destination URL" : "URL de Destino")}
              </label>
              <Input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://tutienda.com/catalogo"
                aria-label={labels.linkUrlLabel ?? (isEn ? "Destination URL" : "URL de Destino")}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" onClick={handleApplyLink} className="h-8 min-h-0 text-xs">
                {isEn ? "Apply" : "Aplicar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLinkPopoverOpen(false);
                  setLinkText("");
                }}
                className="h-8 min-h-0 text-xs"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Popover de incrustación de video por enlace (YouTube / Vimeo) */}
        {videoPopoverOpen && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2">
            <Input
              type="url"
              value={videoDraftUrl}
              onChange={(e) => setVideoDraftUrl(e.target.value)}
              placeholder={labels.videoPlaceholder}
              className="h-8 flex-1 min-w-[220px] text-xs"
            />
            <Button type="button" size="sm" onClick={handleApplyVideo} className="h-8 min-h-0 text-xs">
              {labels.applyVideoCta}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setVideoPopoverOpen(false)}
              className="h-8 min-h-0 text-xs"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Área editable WYSIWYG + zona drag-and-drop para imagen */}
        <div
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            if (disabled) return;
            e.preventDefault();
            setIsDragging(false);
            const droppedFile = e.dataTransfer.files?.[0];
            handleSelectImageFile(droppedFile);
          }}
          className={`relative transition-colors ${
            isDragging ? "bg-[var(--dsn-accent)]/5 ring-2 ring-inset ring-[var(--dsn-accent)]" : ""
          }`}
        >
          {isEditorVisuallyEmpty && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-3 text-xs text-[var(--dsn-text-tertiary)]"
            >
              {placeholder}
            </span>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={isEn ? "Community Wall Post Content" : "Contenido de Publicación en el Muro"}
            onInput={emitEditable}
            onBlur={emitEditable}
            onMouseUp={() => {
              captureSelection();
            }}
            onKeyUp={() => {
              captureSelection();
            }}
            className="min-h-[120px] w-full px-3.5 py-3 text-xs leading-relaxed text-[var(--dsn-text)] focus:outline-none [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[var(--dsn-accent)] [&_a]:underline"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            handleSelectImageFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* Sugerencia de AI revisable antes de aceptar (AGENTS.md §4.7) */}
      {aiSuggestion && (
        <div className="rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/5 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-accent)]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isEn ? "AI Suggestion Ready" : "Sugerencia de AI Lista"}</span>
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={handleAcceptAiSuggestion}
                className="h-7 min-h-0 px-2.5 text-[11px]"
              >
                <Check className="h-3 w-3" />
                <span>{isEn ? "Apply Suggestion" : "Aplicar Sugerencia"}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAiSuggestion(null)}
                className="h-7 min-h-0 px-2.5 text-[11px]"
              >
                <X className="h-3 w-3" />
                <span>{isEn ? "Discard" : "Descartar"}</span>
              </Button>
            </div>
          </div>
          <div
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs leading-relaxed text-[var(--dsn-text)] [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: sanitizeCommunityPostHtml(aiSuggestion) }}
          />
        </div>
      )}

      {/* Errores de media o AI */}
      {(mediaError || aiError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{mediaError || aiError}</AlertDescription>
        </Alert>
      )}

      {/* Previsualización proporcional acotada de imagen destacada */}
      {(previewImageUrl || existingImageUrl) && (
        <div className="relative overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30">
          <div className="flex items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl ?? existingImageUrl ?? ""}
              alt={selectedImageFile?.name ?? (isEn ? "Post Image" : "Imagen de la Publicación")}
              className="mx-auto max-h-[220px] w-auto max-w-full rounded-lg object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-[11px]">
            <span className="truncate text-[var(--dsn-text-secondary)]">
              {selectedImageFile
                ? `${selectedImageFile.name} · ${formatBytesReadable(selectedImageFile.size)}`
                : isEn
                  ? "Current Featured Image"
                  : "Imagen Destacada Actual"}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 min-h-0 px-2 text-[11px]"
              >
                {labels.changeImageCta}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onImageFileChange(null);
                  onRemoveExistingImage?.();
                }}
                className="h-7 min-h-0 px-2 text-[11px] text-rose-500 hover:text-rose-600"
              >
                <X className="h-3 w-3" />
                <span>{labels.removeImageCta}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Previsualización de video incrustado */}
      {videoResolution?.ok && (
        <div className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30">
          <div className="aspect-video w-full">
            <iframe
              src={videoResolution.embedUrl}
              title="Video Incrustado"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <div className="flex items-center justify-between border-t border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-[11px]">
            <span className="truncate text-[var(--dsn-text-secondary)]">{videoUrl}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onVideoUrlChange("")}
              className="h-7 min-h-0 px-2 text-[11px] text-rose-500"
            >
              <X className="h-3 w-3" />
              <span>{labels.removeVideoCta}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Pie discreto con botón de imagen/video y nota de cuota */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--dsn-text-secondary)]">
        <span>{labels.imageHint}</span>
      </div>
    </div>
  );
}
