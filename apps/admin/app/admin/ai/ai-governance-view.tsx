"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu,
  Layers,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit2,
  KeyRound,
  Archive,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  AdminAiGovernanceOverviewDto,
  AdminAiProviderDto,
  AdminAiModelDto,
  AdminAiPlatformKeyDto,
  AdminAiAssistPromptDto,
  AdminPromptBlockDto,
  AiApiDialect,
} from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { ModelsCatalogSection } from "./models-catalog-section";

interface AiGovernanceViewProps {
  initialData: AdminAiGovernanceOverviewDto;
}

type TabType = "models" | "prompts" | "guardrails";

const API_DIALECT_LABELS: Record<AiApiDialect, string> = {
  openai_compatible: "OpenAI Compatible",
  anthropic: "Anthropic Messages",
  google_gemini: "Google Gemini",
};

/**
 * Consola interactiva de gobernanza de IA, modelos LLM y prompts maestros (BOT-001, BOT-002, AI-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function AiGovernanceView({ initialData }: AiGovernanceViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("models");
  const [providers, setProviders] = useState<AdminAiProviderDto[]>(initialData.providers ?? []);
  const [models, setModels] = useState<AdminAiModelDto[]>(initialData.models ?? []);

  // Gestión de Proveedores LLM (Fase 2)
  const [providerModalMode, setProviderModalMode] = useState<"create" | "edit" | null>(null);
  const [editingProvider, setEditingProvider] = useState<AdminAiProviderDto | null>(null);
  const [providerForm, setProviderForm] = useState({
    code: "",
    name: "",
    apiDialect: "openai_compatible" as AiApiDialect,
    baseUrl: "",
    verifyPath: "/models",
    docsUrl: "",
    sortOrder: 10,
    isActive: true,
    logoStorageKey: "",
    logoUrl: "",
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<AdminAiProviderDto | null>(null);
  const [deleteProviderLoading, setDeleteProviderLoading] = useState(false);

  // Gestión de Modelos LLM (Fase 2)
  const [modelModalMode, setModelModalMode] = useState<"create" | "edit" | null>(null);
  const [editingModel, setEditingModel] = useState<AdminAiModelDto | null>(null);
  const [modelForm, setModelForm] = useState({
    providerId: initialData.providers[0]?.id ?? "",
    modelId: "",
    displayName: "",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    defaultTemperature: "0.7",
    defaultMaxTokens: 1000,
    isDefault: false,
    sortOrder: 10,
    spreadPercent: 30,
    costInputMtokUsdCents: 15,
    costOutputMtokUsdCents: 60,
    isActive: true,
  });
  const [modelToDelete, setModelToDelete] = useState<AdminAiModelDto | null>(null);
  const [deleteModelLoading, setDeleteModelLoading] = useState(false);

  const [editingBlock, setEditingBlock] = useState<AdminPromptBlockDto | null>(null);
  const [blockEs, setBlockEs] = useState("");
  const [blockEn, setBlockEn] = useState("");

  const [editingAssistPrompt, setEditingAssistPrompt] = useState<AdminAiAssistPromptDto | null>(null);
  const [assistMasterPrompt, setAssistMasterPrompt] = useState("");
  const [assistInputHint, setAssistInputHint] = useState("");

  const defaultProviderCode = (initialData.providers ?? [])[0]?.code ?? "openai";
  const initialDefaultTrialModel =
    (initialData.models ?? []).find((m) => m.providerCode === defaultProviderCode && m.isActive && m.isDefault) ??
    (initialData.models ?? []).find((m) => m.providerCode === defaultProviderCode && m.isActive) ??
    null;

  const [platformKeys, setPlatformKeys] = useState<AdminAiPlatformKeyDto[]>(initialData.platformKeys ?? []);
  const [trialProviderCode, setTrialProviderCode] = useState<string>(defaultProviderCode);
  const [trialModelId, setTrialModelId] = useState<string>(initialDefaultTrialModel?.id ?? "");
  const [trialKeyId, setTrialKeyId] = useState<string>(`trial-${defaultProviderCode}`);
  const [trialApiKey, setTrialApiKey] = useState<string>("");
  const [trialMonthlyTokenCap, setTrialMonthlyTokenCap] = useState<string>("500000");
  const [trialPriorityRole, setTrialPriorityRole] = useState<"primary" | "secondary" | "standby">("primary");
  const [trialTemperature, setTrialTemperature] = useState<string>(
    String(initialDefaultTrialModel?.defaultTemperature ?? 0.7),
  );
  const [trialMaxTokens, setTrialMaxTokens] = useState<string>(
    String(initialDefaultTrialModel?.defaultMaxTokens ?? 1000),
  );
  const [verifyBeforeSave, setVerifyBeforeSave] = useState<boolean>(true);
  const [keyToRetire, setKeyToRetire] = useState<AdminAiPlatformKeyDto | null>(null);
  const [retireLoading, setRetireLoading] = useState(false);
  const [editingPlatformKey, setEditingPlatformKey] = useState<AdminAiPlatformKeyDto | null>(null);
  const [keySettingsForm, setKeySettingsForm] = useState({
    modelId: "",
    temperature: "0.7",
    maxTokens: "1000",
    monthlyTokenCap: "500000",
  });

  const [defaultsForm, setDefaultsForm] = useState({
    defaultMaxTurns: initialData.defaults.defaultMaxTurns,
    defaultAnswerPolicy: initialData.defaults.defaultAnswerPolicy,
    defaultHandoffTriggers: initialData.defaults.defaultHandoffTriggers.join(", "),
    defaultMaxMessagesPerContact: initialData.defaults.defaultMaxMessagesPerContact,
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function openCreateProviderModal() {
    setEditingProvider(null);
    setLogoUploadError(null);
    setProviderForm({
      code: "",
      name: "",
      apiDialect: "openai_compatible",
      baseUrl: "",
      verifyPath: "/models",
      docsUrl: "",
      sortOrder: (providers.length + 1) * 10,
      isActive: true,
      logoStorageKey: "",
      logoUrl: "",
    });
    setProviderModalMode("create");
  }

  function openEditProviderModal(p: AdminAiProviderDto) {
    setEditingProvider(p);
    setLogoUploadError(null);
    setProviderForm({
      code: p.code,
      name: p.name,
      apiDialect: p.apiDialect ?? "openai_compatible",
      baseUrl: p.baseUrl ?? "",
      verifyPath: p.verifyPath ?? "/models",
      docsUrl: p.docsUrl ?? "",
      sortOrder: p.sortOrder ?? 10,
      isActive: p.isActive,
      logoStorageKey: p.logoStorageKey ?? "",
      logoUrl: p.logoUrl ?? "",
    });
    setProviderModalMode("edit");
  }

  async function handleUploadProviderLogo(file: File | null) {
    if (!file) return;
    setLogoUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError("El archivo supera el límite máximo permitido de 2 MB.");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (providerForm.code.trim()) {
        formData.append("providerCode", providerForm.code.trim().toLowerCase());
      }

      const res = await fetch("/api/admin/ai/providers/logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.detail || data.error || "No se pudo subir el logo del proveedor.");
      }

      setProviderForm((prev) => ({
        ...prev,
        logoStorageKey: data.data.storageKey,
        logoUrl: data.data.logoUrl ?? "",
      }));
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : "Error al cargar el logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSaveProvider(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const isCreate = providerModalMode === "create";
      const payload = isCreate
        ? {
            action: "create_provider",
            code: providerForm.code.trim().toLowerCase(),
            name: providerForm.name.trim(),
            apiDialect: providerForm.apiDialect,
            baseUrl: providerForm.baseUrl.trim(),
            verifyPath: providerForm.verifyPath.trim() || "/models",
            docsUrl: providerForm.docsUrl.trim() || null,
            sortOrder: Number.isFinite(Number(providerForm.sortOrder)) ? Number(providerForm.sortOrder) : 10,
            isActive: providerForm.isActive,
            logoStorageKey: providerForm.logoStorageKey.trim() || null,
          }
        : {
            action: "update_provider",
            providerId: editingProvider?.id,
            name: providerForm.name.trim(),
            apiDialect: providerForm.apiDialect,
            baseUrl: providerForm.baseUrl.trim(),
            verifyPath: providerForm.verifyPath.trim() || "/models",
            docsUrl: providerForm.docsUrl.trim() || null,
            sortOrder: Number.isFinite(Number(providerForm.sortOrder)) ? Number(providerForm.sortOrder) : 10,
            isActive: providerForm.isActive,
            logoStorageKey: providerForm.logoStorageKey.trim() || null,
          };

      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar el proveedor LLM");
      }

      const saved = data.data as AdminAiProviderDto;
      if (isCreate) {
        setProviders((prev) => [...prev, saved]);
      } else {
        setProviders((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      }

      setProviderModalMode(null);
      setEditingProvider(null);
      setFeedback({
        type: "success",
        message: isCreate
          ? `Proveedor ${saved.name} creado correctamente.`
          : `Proveedor ${saved.name} actualizado correctamente.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDeleteProvider() {
    if (!providerToDelete) return;
    setDeleteProviderLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_provider",
          providerId: providerToDelete.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo eliminar el proveedor");
      }

      const mode = data.data?.mode as "soft_deleted" | "hard_deleted" | undefined;
      setProviders((prev) => prev.filter((item) => item.id !== providerToDelete.id));
      setModels((prev) => prev.filter((item) => item.providerId !== providerToDelete.id));

      setFeedback({
        type: "success",
        message:
          mode === "soft_deleted"
            ? `Proveedor ${providerToDelete.name} archivado (mantiene historial de uso).`
            : `Proveedor ${providerToDelete.name} eliminado permanentemente.`,
      });
      setProviderToDelete(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
      setProviderToDelete(null);
    } finally {
      setDeleteProviderLoading(false);
    }
  }

  function openCreateModelModal() {
    setEditingModel(null);
    setModelForm({
      providerId: providers[0]?.id ?? "",
      modelId: "",
      displayName: "",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      defaultTemperature: "0.7",
      defaultMaxTokens: 1000,
      isDefault: false,
      sortOrder: (models.length + 1) * 10,
      spreadPercent: 30,
      costInputMtokUsdCents: 15,
      costOutputMtokUsdCents: 60,
      isActive: true,
    });
    setModelModalMode("create");
  }

  function openEditModelModal(m: AdminAiModelDto) {
    setEditingModel(m);
    setModelForm({
      providerId: m.providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
      defaultTemperature: String(m.defaultTemperature ?? 0.7),
      defaultMaxTokens: m.defaultMaxTokens ?? 1000,
      isDefault: Boolean(m.isDefault),
      sortOrder: m.sortOrder ?? 10,
      spreadPercent: m.spreadPercent,
      costInputMtokUsdCents: m.costInputMtokUsdCents,
      costOutputMtokUsdCents: m.costOutputMtokUsdCents,
      isActive: m.isActive,
    });
    setModelModalMode("edit");
  }

  async function handleSaveModel(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const parseFinite = (val: unknown, fallback: number): number => {
        const parsed = Number(val);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const isCreate = modelModalMode === "create";
      const payload = isCreate
        ? {
            action: "create_model",
            providerId: modelForm.providerId,
            modelId: modelForm.modelId.trim(),
            displayName: modelForm.displayName.trim(),
            contextWindow: parseFinite(modelForm.contextWindow, 128000),
            maxOutputTokens: parseFinite(modelForm.maxOutputTokens, 4096),
            defaultTemperature: String(modelForm.defaultTemperature).trim() || "0.7",
            defaultMaxTokens: parseFinite(modelForm.defaultMaxTokens, 1000),
            isDefault: modelForm.isDefault,
            sortOrder: parseFinite(modelForm.sortOrder, 10),
            spreadPercent: parseFinite(modelForm.spreadPercent, 30),
            costInputMtokUsdCents: parseFinite(modelForm.costInputMtokUsdCents, 0),
            costOutputMtokUsdCents: parseFinite(modelForm.costOutputMtokUsdCents, 0),
            isActive: modelForm.isActive,
          }
        : {
            action: "update_model",
            id: editingModel?.id,
            displayName: modelForm.displayName.trim(),
            contextWindow: parseFinite(modelForm.contextWindow, 128000),
            maxOutputTokens: parseFinite(modelForm.maxOutputTokens, 4096),
            defaultTemperature: String(modelForm.defaultTemperature).trim() || "0.7",
            defaultMaxTokens: parseFinite(modelForm.defaultMaxTokens, 1000),
            isDefault: modelForm.isDefault,
            sortOrder: parseFinite(modelForm.sortOrder, 10),
            spreadPercent: parseFinite(modelForm.spreadPercent, 30),
            costInputMtokUsdCents: parseFinite(modelForm.costInputMtokUsdCents, 0),
            costOutputMtokUsdCents: parseFinite(modelForm.costOutputMtokUsdCents, 0),
            isActive: modelForm.isActive,
          };

      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar el modelo");
      }

      const saved = data.data as AdminAiModelDto;
      setModels((prev) => {
        const nextList = isCreate
          ? [...prev, saved]
          : prev.map((item) => (item.id === saved.id ? saved : item));
        if (saved.isDefault) {
          return nextList.map((item) =>
            item.providerId === saved.providerId && item.id !== saved.id
              ? { ...item, isDefault: false }
              : item,
          );
        }
        return nextList;
      });
      if (isCreate) {
        setProviders((prev) =>
          prev.map((p) =>
            p.id === saved.providerId ? { ...p, modelsCount: p.modelsCount + 1 } : p,
          ),
        );
      }

      setFeedback({
        type: "success",
        message: isCreate
          ? `Modelo ${saved.displayName} agregado al catálogo.`
          : `Modelo ${saved.displayName} actualizado correctamente.`,
      });
      setModelModalMode(null);
      setEditingModel(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickSetDefaultModel(m: AdminAiModelDto) {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_model",
          id: m.id,
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo fijar el modelo por defecto");
      }

      setModels((prev) =>
        prev.map((item) =>
          item.providerId === m.providerId
            ? { ...item, isDefault: item.id === m.id }
            : item,
        ),
      );
      setFeedback({
        type: "success",
        message: `${m.displayName} fijado como modelo por defecto de ${m.providerCode}.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDeleteModel() {
    if (!modelToDelete) return;
    setDeleteModelLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_model",
          id: modelToDelete.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo eliminar el modelo");
      }

      const mode = data.data?.mode as "soft_deleted" | "hard_deleted" | undefined;
      setModels((prev) => prev.filter((item) => item.id !== modelToDelete.id));
      setProviders((prev) =>
        prev.map((p) =>
          p.id === modelToDelete.providerId
            ? { ...p, modelsCount: Math.max(0, p.modelsCount - 1) }
            : p,
        ),
      );

      setFeedback({
        type: "success",
        message:
          mode === "soft_deleted"
            ? `Modelo ${modelToDelete.displayName} archivado (mantiene historial de uso).`
            : `Modelo ${modelToDelete.displayName} eliminado del catálogo.`,
      });
      setModelToDelete(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
      setModelToDelete(null);
    } finally {
      setDeleteModelLoading(false);
    }
  }

  async function handleSavePromptBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBlock) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_prompt_block",
          blockKey: editingBlock.blockKey,
          contentEs: blockEs,
          contentEn: blockEn,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar el bloque de prompt");
      }

      setFeedback({ type: "success", message: `Bloque ${editingBlock.blockKey} versionado y activado.` });
      setEditingBlock(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const triggers = defaultsForm.defaultHandoffTriggers
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_defaults",
          defaultMaxTurns: Number(defaultsForm.defaultMaxTurns),
          defaultAnswerPolicy: defaultsForm.defaultAnswerPolicy,
          defaultHandoffTriggers: triggers,
          defaultMaxMessagesPerContact: Number(defaultsForm.defaultMaxMessagesPerContact),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar parámetros por defecto");
      }

      setFeedback({ type: "success", message: "Parámetros globales de bots guardados exitosamente." });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  function handleTrialProviderChange(nextProviderCode: string) {
    setTrialProviderCode(nextProviderCode);
    setTrialKeyId(`trial-${nextProviderCode}`);
    const defaultModel =
      models.find((m) => m.providerCode === nextProviderCode && m.isActive && m.isDefault) ??
      models.find((m) => m.providerCode === nextProviderCode && m.isActive) ??
      null;
    setTrialModelId(defaultModel?.id ?? "");
    if (defaultModel) {
      setTrialTemperature(String(defaultModel.defaultTemperature ?? 0.7));
      setTrialMaxTokens(String(defaultModel.defaultMaxTokens ?? 1000));
    }
  }

  function handleTrialModelChange(nextModelId: string) {
    setTrialModelId(nextModelId);
    const chosen = models.find((m) => m.id === nextModelId);
    if (chosen) {
      setTrialTemperature(String(chosen.defaultTemperature ?? 0.7));
      setTrialMaxTokens(String(chosen.defaultMaxTokens ?? 1000));
    }
  }

  async function handleSavePlatformKey(e: React.FormEvent) {
    e.preventDefault();
    if (!trialApiKey.trim()) {
      setFeedback({ type: "error", message: "Ingresa la clave API del proveedor antes de guardar." });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_platform_key",
          providerCode: trialProviderCode,
          modelId: trialModelId || null,
          keyId: trialKeyId.trim() || undefined,
          apiKey: trialApiKey.trim(),
          monthlyTokenCap: trialMonthlyTokenCap.trim() ? Number(trialMonthlyTokenCap) : null,
          priorityRole: trialPriorityRole,
          temperature: trialTemperature.trim() || "0.7",
          maxTokens: Number.parseInt(trialMaxTokens, 10) || 1000,
          verifyImmediately: verifyBeforeSave,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar la llave de prueba de plataforma");
      }

      const savedKey = data.data as AdminAiPlatformKeyDto;
      const savedRole = savedKey.priorityRole ?? trialPriorityRole;
      setPlatformKeys((prev) => [
        { ...savedKey, priorityRole: savedRole },
        ...prev.map((item) =>
          (savedRole === "primary" || savedRole === "secondary") &&
          item.status === "active" &&
          (item.purpose ?? "inference") === (savedKey.purpose ?? "inference") &&
          (item.priorityRole ?? "primary") === savedRole
            ? { ...item, status: "retired" }
            : item,
        ),
      ]);
      setTrialApiKey("");
      setFeedback({
        type: "success",
        message: `Llave de prueba ••••${savedKey.apiKeyLast4} (${savedKey.providerName}) verificada y activada (${
          savedRole === "primary"
            ? "Primario"
            : savedRole === "secondary"
              ? "Secundario"
              : "En Espera"
        }).`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPlatformKeyPriority(
    pk: AdminAiPlatformKeyDto,
    nextRole: "primary" | "secondary" | "standby",
  ) {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_platform_key_priority",
          platformKeyId: pk.id,
          priorityRole: nextRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cambiar la prioridad de la llave");
      }

      setPlatformKeys((prev) =>
        prev.map((item) => {
          if (item.id === pk.id) return { ...item, priorityRole: nextRole };
          if (
            nextRole !== "standby" &&
            item.status === "active" &&
            item.priorityRole === nextRole
          ) {
            return { ...item, priorityRole: "standby" as const };
          }
          return item;
        }),
      );
      setFeedback({
        type: "success",
        message: `Llave ••••${pk.apiKeyLast4} asignada como ${
          nextRole === "primary"
            ? "Primaria"
            : nextRole === "secondary"
              ? "Secundaria"
              : "En Espera"
        }.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePlatformKeySettings(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlatformKey) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_platform_key_settings",
          platformKeyId: editingPlatformKey.id,
          modelId: keySettingsForm.modelId || null,
          temperature: keySettingsForm.temperature.trim() || "0.7",
          maxTokens: Number.parseInt(keySettingsForm.maxTokens, 10) || 1000,
          monthlyTokenCap: keySettingsForm.monthlyTokenCap.trim()
            ? Number.parseInt(keySettingsForm.monthlyTokenCap, 10)
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudieron actualizar los parámetros de la llave");
      }

      const updated = data.data as AdminAiPlatformKeyDto;
      setPlatformKeys((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingPlatformKey(null);
      setFeedback({
        type: "success",
        message: `Parámetros de la llave ••••${updated.apiKeyLast4} actualizados.`,
      });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmRetireKey() {
    if (!keyToRetire) return;
    setRetireLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retire_platform_key",
          platformKeyId: keyToRetire.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo retirar la credencial");
      }

      setPlatformKeys((prev) =>
        prev.map((item) =>
          item.id === keyToRetire.id ? { ...item, status: "retired" } : item,
        ),
      );
      setFeedback({
        type: "success",
        message: `Llave ••••${keyToRetire.apiKeyLast4} retirada correctamente.`,
      });
      setKeyToRetire(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setRetireLoading(false);
    }
  }

  async function handleSaveAssistPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAssistPrompt) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_assist_prompt",
          fieldKey: editingAssistPrompt.fieldKey,
          masterPrompt: assistMasterPrompt,
          inputHint: assistInputHint,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al versionar el prompt maestro");
      }

      setFeedback({
        type: "success",
        message: `Prompt maestro ${editingAssistPrompt.fieldKey} actualizado a versión v${data.data.version}.`,
      });
      setEditingAssistPrompt(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Selector de Pestañas HUD */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
        <button
          type="button"
          onClick={() => { setActiveTab("models"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === "models"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>Proveedores y Modelos LLM</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("prompts"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === "prompts"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Biblioteca De Prompts Maestros</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("guardrails"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            activeTab === "guardrails"
              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Parámetros Globales y Guardrails</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 1: PROVEEDORES Y MODELOS LLM
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "models" && (
        <div className="space-y-6">
          {/* Grilla dinámica de proveedores LLM con alta, edición, logo y borrado */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
                  Proveedores LLM Registrados
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  Administra proveedores soportados, dialectos HTTP, endpoints base y logotipos de marca.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateProviderModal}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar Proveedor LLM</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {providers.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    {p.logoUrl ? (
                      <img
                        src={p.logoUrl}
                        alt={p.name}
                        className="h-10 w-10 rounded-lg object-cover border border-[var(--dsn-border)] bg-[var(--dsn-background)] shrink-0"
                      />
                    ) : (
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] font-bold font-mono text-xs shrink-0">
                        {p.code.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-[var(--dsn-text)] truncate">{p.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                            p.isActive
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-zinc-500/10 text-zinc-400"
                          }`}
                        >
                          {p.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[var(--dsn-text-secondary)] truncate">
                        {p.code} · {p.modelsCount} modelos
                      </p>
                      <p className="text-[10px] text-[var(--dsn-text-secondary)] truncate mt-0.5">
                        {API_DIALECT_LABELS[p.apiDialect ?? "openai_compatible"]}
                      </p>
                      {p.baseUrl && (
                        <p className="text-[10px] font-mono text-[var(--dsn-text-secondary)]/80 truncate mt-0.5">
                          {p.baseUrl}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => openEditProviderModal(p)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProviderToDelete(p)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Llave de prueba de plataforma para onboarding y trials activos */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dsn-border)] pb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--dsn-text)] flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[var(--dsn-accent)]" />
                  <span>Llave De Prueba De Plataforma (Onboarding Y Periodo De Prueba)</span>
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Credenciales cifradas administradas por la plataforma (Primaria y Respaldo Secundario automático) para asistir a nuevos espacios durante el onboarding inicial y pruebas vigentes.
                </p>
              </div>
              <span className="rounded-full bg-[var(--dsn-accent)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--dsn-accent)]">
                {platformKeys.some((pk) => pk.status === "active")
                  ? "Credencial Activa Configurada"
                  : "Pendiente De Configuración"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Formulario de registro / rotación */}
              <form onSubmit={handleSavePlatformKey} className="space-y-4 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4">
                <h3 className="text-xs font-semibold text-[var(--dsn-text)]">
                  Registrar O Rotar Credencial Activa
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="trialProviderSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Proveedor LLM
                    </label>
                    <select
                      id="trialProviderSelect"
                      value={trialProviderCode}
                      onChange={(e) => handleTrialProviderChange(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="trialModelSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Modelo Por Defecto
                    </label>
                    <select
                      id="trialModelSelect"
                      value={trialModelId}
                      onChange={(e) => handleTrialModelChange(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    >
                      {models
                        .filter((m) => m.providerCode === trialProviderCode && m.isActive)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} ({m.modelId}){m.isDefault ? " — Por Defecto" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="trialApiKeyInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                    Clave API Del Proveedor
                  </label>
                  <input
                    id="trialApiKeyInput"
                    type="password"
                    autoComplete="off"
                    required
                    value={trialApiKey}
                    onChange={(e) => setTrialApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                  />
                  <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                    Se cifra con AES-256-GCM antes de guardarse. Nunca se vuelve a mostrar completa ni en registros.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="trialKeyAliasInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Alias De Credencial
                    </label>
                    <input
                      id="trialKeyAliasInput"
                      type="text"
                      value={trialKeyId}
                      onChange={(e) => setTrialKeyId(e.target.value)}
                      placeholder="trial-openai"
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="trialTokenCapInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Tope Mensual De Tokens
                    </label>
                    <input
                      id="trialTokenCapInput"
                      type="number"
                      min="0"
                      value={trialMonthlyTokenCap}
                      onChange={(e) => setTrialMonthlyTokenCap(e.target.value)}
                      placeholder="500000"
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="trialPriorityRoleSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Rol De Prioridad
                    </label>
                    <select
                      id="trialPriorityRoleSelect"
                      value={trialPriorityRole}
                      onChange={(e) =>
                        setTrialPriorityRole(e.target.value as "primary" | "secondary" | "standby")
                      }
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    >
                      <option value="primary">Predeterminado (Primario)</option>
                      <option value="secondary">Respaldo (Secundario)</option>
                      <option value="standby">En Espera</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="trialTemperatureInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Temperatura De Respuesta (0.0 – 2.0)
                    </label>
                    <input
                      id="trialTemperatureInput"
                      type="number"
                      step="0.01"
                      min="0"
                      max="2"
                      value={trialTemperature}
                      onChange={(e) => setTrialTemperature(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="trialMaxTokensInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Límite Máximo De Tokens
                    </label>
                    <input
                      id="trialMaxTokensInput"
                      type="number"
                      min="64"
                      max="8192"
                      step="1"
                      value={trialMaxTokens}
                      onChange={(e) => setTrialMaxTokens(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="verifyPlatformKeyCheck"
                    type="checkbox"
                    checked={verifyBeforeSave}
                    onChange={(e) => setVerifyBeforeSave(e.target.checked)}
                    className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                  />
                  <label htmlFor="verifyPlatformKeyCheck" className="text-xs font-medium text-[var(--dsn-text)]">
                    Verificar Conectividad Antes De Activar
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Guardar Y Activar Llave De Prueba</span>
                </button>
              </form>

              {/* Listado de credenciales enmascaradas registradas */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[var(--dsn-text)]">
                  Credenciales Registradas (Enmascaradas)
                </h3>

                {platformKeys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4 text-xs text-[var(--dsn-text-secondary)]">
                    Aún no hay llaves de prueba registradas. Registra una credencial activa para habilitar la asistencia automática durante onboardings y pruebas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {platformKeys.map((pk) => {
                      const role = pk.priorityRole ?? "standby";
                      return (
                        <div
                          key={pk.id}
                          className="flex flex-col gap-2.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-[var(--dsn-text)]">
                                {pk.providerName}
                              </span>
                              <span className="font-mono text-[11px] text-[var(--dsn-accent)]">
                                ••••{pk.apiKeyLast4}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  pk.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-zinc-500/10 text-zinc-400"
                                }`}
                              >
                                {pk.status === "active" ? "Activa" : "Retirada"}
                              </span>
                              {pk.status === "active" && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                    role === "primary"
                                      ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                                      : role === "secondary"
                                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                        : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                                  }`}
                                >
                                  {role === "primary"
                                    ? "Primario"
                                    : role === "secondary"
                                      ? "Secundario"
                                      : "En Espera"}
                                </span>
                              )}
                            </div>

                            {pk.status === "active" && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {role !== "primary" && (
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handleSetPlatformKeyPriority(pk, "primary")}
                                    className="inline-flex min-h-[34px] items-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50"
                                  >
                                    Definir Primario
                                  </button>
                                )}
                                {role !== "secondary" && (
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => handleSetPlatformKeyPriority(pk, "secondary")}
                                    className="inline-flex min-h-[34px] items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                                  >
                                    Definir Secundario
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => {
                                    setEditingPlatformKey(pk);
                                    setKeySettingsForm({
                                      modelId: pk.defaultModelId ?? "",
                                      temperature: String(pk.temperature ?? 0.7),
                                      maxTokens: String(pk.maxTokens ?? 1000),
                                      monthlyTokenCap: pk.monthlyTokenCap ? String(pk.monthlyTokenCap) : "",
                                    });
                                  }}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                                >
                                  <Sliders className="h-3 w-3" />
                                  <span>Parámetros</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setKeyToRetire(pk)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20"
                                >
                                  <Archive className="h-3 w-3" />
                                  <span>Retirar</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">
                            Alias: {pk.keyId} · Modelo: {pk.defaultModelCode || "Por defecto"} · Temp:{" "}
                            {pk.temperature ?? "0.7"} · Tokens: {pk.maxTokens ?? 1000} · Tope:{" "}
                            {pk.monthlyTokenCap ? `${pk.monthlyTokenCap.toLocaleString()} tokens/mes` : "Sin tope"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Tabla de Modelos y Spread */}
          <ModelsCatalogSection
            models={models}
            providers={providers}
            loading={loading}
            onOpenCreateModel={openCreateModelModal}
            onOpenEditModel={openEditModelModal}
            onQuickSetDefault={handleQuickSetDefaultModel}
            onRequestDeleteModel={setModelToDelete}
          />

          {/* Modal Crear / Editar Proveedor LLM */}
          {providerModalMode && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            >
              <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {providerModalMode === "create"
                    ? "Agregar Proveedor LLM"
                    : `Editar Proveedor: ${editingProvider?.name ?? ""}`}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Define el protocolo HTTP, endpoint base y logotipo visual del proveedor.
                </p>

                <form onSubmit={handleSaveProvider} className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="providerCodeInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Código De Proveedor (Slug)
                      </label>
                      <input
                        id="providerCodeInput"
                        type="text"
                        required
                        disabled={providerModalMode === "edit"}
                        value={providerForm.code}
                        onChange={(e) => setProviderForm({ ...providerForm, code: e.target.value })}
                        placeholder="deepseek"
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor="providerNameInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Nombre Del Proveedor
                      </label>
                      <input
                        id="providerNameInput"
                        type="text"
                        required
                        value={providerForm.name}
                        onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                        placeholder="DeepSeek"
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="providerDialectSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Dialecto De Api
                      </label>
                      <select
                        id="providerDialectSelect"
                        value={providerForm.apiDialect}
                        onChange={(e) =>
                          setProviderForm({
                            ...providerForm,
                            apiDialect: e.target.value as AiApiDialect,
                          })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      >
                        <option value="openai_compatible">OpenAI Compatible</option>
                        <option value="anthropic">Anthropic Messages</option>
                        <option value="google_gemini">Google Gemini</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="providerSortOrderInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Orden De Visualización
                      </label>
                      <input
                        id="providerSortOrderInput"
                        type="number"
                        min="0"
                        value={providerForm.sortOrder}
                        onChange={(e) =>
                          setProviderForm({ ...providerForm, sortOrder: Number(e.target.value) })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="providerBaseUrlInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Url Base De Inferencia
                      </label>
                      <input
                        id="providerBaseUrlInput"
                        type="url"
                        required
                        value={providerForm.baseUrl}
                        onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                        placeholder="https://api.deepseek.com"
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="providerVerifyPathInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Ruta De Verificación
                      </label>
                      <input
                        id="providerVerifyPathInput"
                        type="text"
                        required
                        value={providerForm.verifyPath}
                        onChange={(e) =>
                          setProviderForm({ ...providerForm, verifyPath: e.target.value })
                        }
                        placeholder="/models"
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="providerDocsUrlInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Url De Documentación (Opcional)
                    </label>
                    <input
                      id="providerDocsUrlInput"
                      type="url"
                      value={providerForm.docsUrl}
                      onChange={(e) => setProviderForm({ ...providerForm, docsUrl: e.target.value })}
                      placeholder="https://platform.deepseek.com/api_keys"
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="providerLogoUploadInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Logo Del Proveedor (PNG, JPG, WebP O AVIF — Máx. 2 MB)
                    </label>
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3">
                      {providerForm.logoUrl ? (
                        <img
                          src={providerForm.logoUrl}
                          alt={providerForm.name || "Logo"}
                          className="h-10 w-10 rounded-lg object-cover border border-[var(--dsn-border)]"
                        />
                      ) : (
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/10 text-xs font-bold font-mono text-[var(--dsn-accent)]">
                          {(providerForm.code || "AI").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-[180px]">
                        <input
                          id="providerLogoUploadInput"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif"
                          disabled={uploadingLogo}
                          onChange={(e) => handleUploadProviderLogo(e.target.files?.[0] ?? null)}
                          className="block w-full text-xs text-[var(--dsn-text-secondary)] file:mr-3 file:rounded-md file:border file:border-[var(--dsn-border)] file:bg-[var(--dsn-surface)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--dsn-text)] hover:file:border-[var(--dsn-accent)]"
                        />
                        {uploadingLogo && (
                          <p className="text-[11px] text-[var(--dsn-accent)] mt-1 inline-flex items-center gap-1">
                            <Upload className="h-3 w-3 animate-pulse" />
                            <span>Subiendo y validando imagen...</span>
                          </p>
                        )}
                        {logoUploadError && (
                          <p className="text-[11px] text-rose-400 mt-1">{logoUploadError}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="providerActiveCheck"
                      type="checkbox"
                      checked={providerForm.isActive}
                      onChange={(e) =>
                        setProviderForm({ ...providerForm, isActive: e.target.checked })
                      }
                      className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                    />
                    <label htmlFor="providerActiveCheck" className="text-xs font-medium text-[var(--dsn-text)]">
                      Proveedor Activo En La Plataforma
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setProviderModalMode(null);
                        setEditingProvider(null);
                      }}
                      className="min-h-[44px] rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading || uploadingLogo}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>
                        {providerModalMode === "create" ? "Crear Proveedor" : "Guardar Proveedor"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Crear / Editar Modelo LLM */}
          {modelModalMode && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            >
              <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {modelModalMode === "create"
                    ? "Agregar Modelo LLM"
                    : `Configurar Modelo: ${editingModel?.displayName ?? ""}`}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Ajusta parámetros de respuesta por defecto, contexto, costos base y margen comercial (spread).
                </p>

                <form onSubmit={handleSaveModel} className="mt-4 space-y-4">
                  {modelModalMode === "create" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="modelProviderSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                          Proveedor LLM
                        </label>
                        <select
                          id="modelProviderSelect"
                          value={modelForm.providerId}
                          onChange={(e) => setModelForm({ ...modelForm, providerId: e.target.value })}
                          className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                        >
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="modelSlugInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                          Identificador Del Modelo (Slug Api)
                        </label>
                        <input
                          id="modelSlugInput"
                          type="text"
                          required
                          value={modelForm.modelId}
                          onChange={(e) => setModelForm({ ...modelForm, modelId: e.target.value })}
                          placeholder="deepseek-chat"
                          className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="modelDisplayNameInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Nombre Visible Del Modelo
                    </label>
                    <input
                      id="modelDisplayNameInput"
                      type="text"
                      required
                      value={modelForm.displayName}
                      onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                      placeholder="DeepSeek Chat"
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="modelDefaultTempInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Temperatura Por Defecto (0.0 – 2.0)
                      </label>
                      <input
                        id="modelDefaultTempInput"
                        type="number"
                        step="0.01"
                        min="0"
                        max="2"
                        required
                        value={modelForm.defaultTemperature}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, defaultTemperature: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="modelDefaultTokensInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Tokens Máximos Por Defecto
                      </label>
                      <input
                        id="modelDefaultTokensInput"
                        type="number"
                        min="64"
                        max="8192"
                        step="1"
                        required
                        value={modelForm.defaultMaxTokens}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, defaultMaxTokens: Number(e.target.value) })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="modelContextInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Ventana De Contexto (Tokens)
                      </label>
                      <input
                        id="modelContextInput"
                        type="number"
                        min="1024"
                        required
                        value={modelForm.contextWindow}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, contextWindow: Number(e.target.value) })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="modelMaxOutInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Máximo De Tokens De Salida
                      </label>
                      <input
                        id="modelMaxOutInput"
                        type="number"
                        min="64"
                        required
                        value={modelForm.maxOutputTokens}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, maxOutputTokens: Number(e.target.value) })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="modelCostInInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Costo Entrada (¢/Mtok)
                      </label>
                      <input
                        id="modelCostInInput"
                        type="number"
                        min="0"
                        required
                        value={modelForm.costInputMtokUsdCents}
                        onChange={(e) =>
                          setModelForm({
                            ...modelForm,
                            costInputMtokUsdCents: Number(e.target.value),
                          })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="modelCostOutInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Costo Salida (¢/Mtok)
                      </label>
                      <input
                        id="modelCostOutInput"
                        type="number"
                        min="0"
                        required
                        value={modelForm.costOutputMtokUsdCents}
                        onChange={(e) =>
                          setModelForm({
                            ...modelForm,
                            costOutputMtokUsdCents: Number(e.target.value),
                          })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="modelSpreadInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Spread Comercial (%)
                      </label>
                      <input
                        id="modelSpreadInput"
                        type="number"
                        min="0"
                        max="200"
                        required
                        value={modelForm.spreadPercent}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, spreadPercent: Number(e.target.value) })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="modelDefaultCheck"
                        checked={modelForm.isDefault}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, isDefault: e.target.checked })
                        }
                        className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                      />
                      <label htmlFor="modelDefaultCheck" className="text-xs font-medium text-[var(--dsn-text)]">
                        Modelo Por Defecto Del Proveedor
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="modelActiveCheck"
                        checked={modelForm.isActive}
                        onChange={(e) =>
                          setModelForm({ ...modelForm, isActive: e.target.checked })
                        }
                        className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                      />
                      <label htmlFor="modelActiveCheck" className="text-xs font-medium text-[var(--dsn-text)]">
                        Modelo Activo Para Inferencia
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setModelModalMode(null);
                        setEditingModel(null);
                      }}
                      className="min-h-[44px] rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>
                        {modelModalMode === "create" ? "Crear Modelo" : "Guardar Cambios"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Parámetros De Llave De Plataforma */}
          {editingPlatformKey && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            >
              <div className="w-full max-w-md rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Parámetros De Credencial: {editingPlatformKey.providerName} (••••{editingPlatformKey.apiKeyLast4})
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Ajusta el modelo por defecto, temperatura, máximo de tokens y cuota mensual de esta credencial.
                </p>

                <form onSubmit={handleSavePlatformKeySettings} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="editKeyModelSelect" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Modelo Por Defecto
                    </label>
                    <select
                      id="editKeyModelSelect"
                      value={keySettingsForm.modelId}
                      onChange={(e) => setKeySettingsForm({ ...keySettingsForm, modelId: e.target.value })}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    >
                      {models
                        .filter((m) => m.providerId === editingPlatformKey.providerId && m.isActive)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} ({m.modelId})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="editKeyTempInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Temperatura De Respuesta (0.0 – 2.0)
                      </label>
                      <input
                        id="editKeyTempInput"
                        type="number"
                        step="0.01"
                        min="0"
                        max="2"
                        required
                        value={keySettingsForm.temperature}
                        onChange={(e) =>
                          setKeySettingsForm({ ...keySettingsForm, temperature: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>

                    <div>
                      <label htmlFor="editKeyTokensInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                        Límite Máximo De Tokens
                      </label>
                      <input
                        id="editKeyTokensInput"
                        type="number"
                        min="64"
                        max="8192"
                        step="1"
                        required
                        value={keySettingsForm.maxTokens}
                        onChange={(e) =>
                          setKeySettingsForm({ ...keySettingsForm, maxTokens: e.target.value })
                        }
                        className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="editKeyCapInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Tope Mensual De Tokens (Opcional)
                    </label>
                    <input
                      id="editKeyCapInput"
                      type="number"
                      min="0"
                      value={keySettingsForm.monthlyTokenCap}
                      onChange={(e) =>
                        setKeySettingsForm({ ...keySettingsForm, monthlyTokenCap: e.target.value })
                      }
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => setEditingPlatformKey(null)}
                      className="min-h-[44px] rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Guardar Parámetros</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 2: BIBLIOTECA DE PROMPTS MAESTROS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "prompts" && (
        <div className="space-y-6">
          {/* Bloques modulares del prompt del bot */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
                  Bloques De Composición Dinámica Del Bot
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Estructura modular en capas (identidad, personalidad, medios, orden, cierre) del asistente comercial.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initialData.promptBlocks.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[var(--dsn-accent)]">
                      {b.blockKey}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                        v{b.version}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBlock(b);
                          setBlockEs(b.contentEs);
                          setBlockEn(b.contentEn);
                        }}
                        className="inline-flex items-center gap-1 rounded bg-[var(--dsn-surface)] border border-[var(--dsn-border)] px-2 py-0.5 text-[11px] text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--dsn-text)] line-clamp-3 bg-[var(--dsn-surface)] p-2 rounded border border-[var(--dsn-border)] font-mono text-[11px]">
                    {b.contentEs}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Prompts maestros de asistencia con AI (AiAssist) */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dsn-border)] pb-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
                  Prompts Maestros De Asistencia «Mejorar Con AI»
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Directivas especializadas para cada campo de texto libre editable por los inquilinos.
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-400">
                {initialData.aiAssistPrompts.length} campos activos
              </span>
            </div>

            <div className="divide-y divide-[var(--dsn-border)]">
              {initialData.aiAssistPrompts.map((ap) => (
                <div key={ap.id} className="py-3 flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">{ap.fieldLabel}</span>
                      <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">({ap.fieldKey})</span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400">v{ap.version}</span>
                    </div>
                    <p className="text-xs text-[var(--dsn-text-secondary)] font-mono text-[11px] line-clamp-2">
                      {ap.masterPrompt}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-400 font-mono">
                      Asistido
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssistPrompt(ap);
                        setAssistMasterPrompt(ap.masterPrompt);
                        setAssistInputHint(ap.inputHint || "");
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded bg-[var(--dsn-background)] border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Editar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Modal de edición/versionado de prompt maestro de asistencia */}
          {editingAssistPrompt && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Versionar Prompt Maestro: {editingAssistPrompt.fieldLabel}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Campo <span className="font-mono">{editingAssistPrompt.fieldKey}</span> (actual v{editingAssistPrompt.version}). Al guardar se publicará una nueva versión activa inmutable.
                </p>

                <form onSubmit={handleSaveAssistPrompt} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="assistMasterPromptTextarea" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Instrucción Del Prompt Maestro
                    </label>
                    <textarea
                      id="assistMasterPromptTextarea"
                      required
                      rows={5}
                      value={assistMasterPrompt}
                      onChange={(e) => setAssistMasterPrompt(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="assistInputHintInput" className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Guía De Entrada Para El Usuario
                    </label>
                    <input
                      id="assistInputHintInput"
                      type="text"
                      value={assistInputHint}
                      onChange={(e) => setAssistInputHint(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => setEditingAssistPrompt(null)}
                      className="min-h-[44px] rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Publicar Nueva Versión</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal de edición de bloque de prompt */}
          {editingBlock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Editar Bloque De Prompt: {editingBlock.blockKey}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Al guardar se incrementa automáticamente la versión y se activa de forma inmutable para todos los bots.
                </p>

                <form onSubmit={handleSavePromptBlock} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Contenido En Español
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={blockEs}
                      onChange={(e) => setBlockEs(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Contenido En Inglés (English)
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={blockEn}
                      onChange={(e) => setBlockEn(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => setEditingBlock(null)}
                      className="rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Versionar Bloque</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 3: PARÁMETROS GLOBALES Y GUARDRAILS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "guardrails" && (
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs max-w-2xl">
          <div className="border-b border-[var(--dsn-border)] pb-3 mb-5">
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Límites Operativos y Guardrails De Seguridad
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Valores por defecto aplicados a los nuevos bots creados por los inquilinos en la SaaS.
            </p>
          </div>

          <form onSubmit={handleSaveDefaults} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Turnos Máximos De Conversación
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={defaultsForm.defaultMaxTurns}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultMaxTurns: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Límite de turnos de diálogo antes de ofrecer forzosamente transferencia con un humano.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Política De Respuesta Por Defecto
              </label>
              <select
                value={defaultsForm.defaultAnswerPolicy}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultAnswerPolicy: e.target.value })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
              >
                <option value="solo_conocimiento">Solo Conocimiento Verificado (Estricta contra alucinaciones)</option>
                <option value="libre">Respuesta Libre Con Contexto Comercial</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Palabras Clave De Transferencia A Asesor Humano (Handoff)
              </label>
              <input
                type="text"
                value={defaultsForm.defaultHandoffTriggers}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultHandoffTriggers: e.target.value })}
                placeholder="asesor, humano, reclamo, queja, agente"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Separadas por comas. El bot pausa automáticamente su intervención si el cliente escribe alguna de ellas.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Mensajes Máximos Permitidos Por Contacto
              </label>
              <input
                type="number"
                min="10"
                max="500"
                value={defaultsForm.defaultMaxMessagesPerContact}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultMaxMessagesPerContact: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
            </div>

            <div className="pt-3 border-t border-[var(--dsn-border)]">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Guardar Parámetros Globales</span>
              </button>
            </div>
          </form>
        </section>
      )}

      <ConfirmationModal
        isOpen={Boolean(keyToRetire)}
        onClose={() => {
          if (!retireLoading) setKeyToRetire(null);
        }}
        onConfirm={handleConfirmRetireKey}
        title="Retirar Llave De Prueba De Plataforma"
        subtitle="Esta credencial dejará de usarse para asistencia durante el onboarding y pruebas."
        variant="warning"
        details={
          keyToRetire
            ? [
                { label: "Proveedor", value: keyToRetire.providerName },
                { label: "Alias", value: keyToRetire.keyId, mono: true },
                { label: "Terminación", value: `••••${keyToRetire.apiKeyLast4}`, mono: true },
              ]
            : undefined
        }
        warningTitle="Impacto En Nuevas Pruebas"
        warningMessage="Si no existe otra llave activa en plataforma, los espacios en periodo de prueba requerirán configurar su propia llave de proveedor para usar asistencia con AI."
        confirmText="Confirmar Retiro"
        confirmLoadingText="Retirando Credencial..."
        cancelText="Mantener Activa"
        loading={retireLoading}
      />

      <ConfirmationModal
        isOpen={Boolean(providerToDelete)}
        onClose={() => {
          if (!deleteProviderLoading) setProviderToDelete(null);
        }}
        onConfirm={handleConfirmDeleteProvider}
        title="Eliminar Proveedor LLM"
        subtitle="Si el proveedor tiene modelos históricos utilizados, se desactivará de forma segura; si tiene credenciales activas o bots asignados, deberá reasignarse primero."
        variant="danger"
        details={
          providerToDelete
            ? [
                { label: "Proveedor", value: providerToDelete.name },
                { label: "Código", value: providerToDelete.code, mono: true },
                { label: "Modelos Asociados", value: String(providerToDelete.modelsCount) },
              ]
            : undefined
        }
        warningTitle="Validación De Integridad Referencial"
        warningMessage="Esta acción verifica que no existan llaves de plataforma o credenciales de comercios activas ni bots en operación vinculados al proveedor."
        confirmText="Confirmar Eliminación"
        confirmLoadingText="Eliminando Proveedor..."
        cancelText="Cancelar"
        loading={deleteProviderLoading}
      />

      <ConfirmationModal
        isOpen={Boolean(modelToDelete)}
        onClose={() => {
          if (!deleteModelLoading) setModelToDelete(null);
        }}
        onConfirm={handleConfirmDeleteModel}
        title="Eliminar Modelo LLM"
        subtitle="Si el modelo registra eventos de consumo previos se desactivará preservando auditoría; si tiene bots o credenciales activas asignadas, la eliminación será bloqueada."
        variant="danger"
        details={
          modelToDelete
            ? [
                { label: "Modelo", value: modelToDelete.displayName },
                { label: "Slug API", value: modelToDelete.modelId, mono: true },
                { label: "Proveedor", value: modelToDelete.providerCode, mono: true },
              ]
            : undefined
        }
        warningTitle="Impacto En Catálogo"
        warningMessage="Los comercios ya no podrán seleccionar este modelo para nuevas configuraciones de bot o asistencia."
        confirmText="Confirmar Eliminación"
        confirmLoadingText="Eliminando Modelo..."
        cancelText="Cancelar"
        loading={deleteModelLoading}
      />
    </div>
  );
}
