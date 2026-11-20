"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Layers,
  MoreVertical,
  Package,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmationModal,
  CustomSelect,
  CustomSelectContent,
  CustomSelectItem,
  CustomSelectTrigger,
  CustomSelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FormField,
  FormSaveBar,
  Input,
  Label,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WorkspaceDataTable,
} from "@mocter/ui";
import { DataTable } from "@/components/data-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { validateContrast } from "@/lib/contrast";

interface TokenRow {
  [key: string]: unknown;
  token: string;
  layer: string;
  dark: string;
  light: string;
  wcagRatio: string;
}

interface DemoCatalogItem {
  id: string;
  name: string;
  category: string;
  price: string;
  status: "active" | "draft";
}

const DEFAULT_TOKENS = {
  accent: "#22d3ee",
  accentHover: "#67e8f9",
  background: "#0a0a0b",
  surface: "#121214",
  text: "#ededef",
  radius: "0.5rem",
};

const DEMO_PRODUCTS: DemoCatalogItem[] = [
  { id: "PRD-01", name: "Asistente Conversacional Pro", category: "Automatización", price: "$149", status: "active" },
  { id: "PRD-02", name: "Conector WhatsApp Cloud", category: "Canales", price: "$89", status: "active" },
  { id: "PRD-03", name: "Paquete Plantillas AI", category: "Inteligencia", price: "$49", status: "draft" },
];

/**
 * Catálogo vivo e interactivo del Sistema de Diseño (`DSN-001`, `/design-system`).
 *
 * Permite modificar los tokens en caliente con validación WCAG 2.2 AA y probar
 * en modo claro y oscuro todas las primitivas y compuestos de `@mocter/ui`.
 */
export function DesignSystemPlayground() {
  const [accent, setAccent] = useState(DEFAULT_TOKENS.accent);
  const [accentHover, setAccentHover] = useState(DEFAULT_TOKENS.accentHover);
  const [background, setBackground] = useState(DEFAULT_TOKENS.background);
  const [surface, setSurface] = useState(DEFAULT_TOKENS.surface);
  const [textColor, setTextColor] = useState(DEFAULT_TOKENS.text);
  const [radius, setRadius] = useState(DEFAULT_TOKENS.radius);
  const [notification, setNotification] = useState<string | null>(null);

  const [sampleChecked, setSampleChecked] = useState(true);
  const [sampleSwitched, setSampleSwitched] = useState(true);
  const [sampleSelect, setSampleSelect] = useState("pro");
  const [sampleCustomSelect, setSampleCustomSelect] = useState("cyan");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mocter_custom_design_tokens");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed["--dsn-accent"]) setAccent(parsed["--dsn-accent"]);
        if (parsed["--dsn-accent-hover"]) setAccentHover(parsed["--dsn-accent-hover"]);
        if (parsed["--dsn-background"]) setBackground(parsed["--dsn-background"]);
        if (parsed["--dsn-surface"]) setSurface(parsed["--dsn-surface"]);
        if (parsed["--dsn-text"]) setTextColor(parsed["--dsn-text"]);
        if (parsed["--primitive-radius-md"]) setRadius(parsed["--primitive-radius-md"]);
      }
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }, []);

  const textContrast = useMemo(() => validateContrast(textColor, background, true), [textColor, background]);
  const accentContrast = useMemo(() => validateContrast(accent, background, false), [accent, background]);
  const surfaceContrast = useMemo(() => validateContrast(textColor, surface, true), [textColor, surface]);

  const handleApplyTokens = () => {
    const root = document.documentElement;
    const tokens: Record<string, string> = {
      "--dsn-accent": accent,
      "--dsn-accent-hover": accentHover,
      "--dsn-background": background,
      "--dsn-surface": surface,
      "--dsn-text": textColor,
      "--primitive-radius-md": radius,
    };

    Object.entries(tokens).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    try {
      localStorage.setItem("mocter_custom_design_tokens", JSON.stringify(tokens));
    } catch {
      // Ignorar almacenamiento
    }

    setNotification("Tokens aplicados exitosamente en caliente a la plataforma.");
    setTimeout(() => setNotification(null), 4000);
  };

  const handleResetDefaults = () => {
    const root = document.documentElement;
    [
      "--dsn-accent",
      "--dsn-accent-hover",
      "--dsn-background",
      "--dsn-surface",
      "--dsn-text",
      "--primitive-radius-md",
    ].forEach((prop) => root.style.removeProperty(prop));

    try {
      localStorage.removeItem("mocter_custom_design_tokens");
    } catch {
      // Ignorar almacenamiento
    }

    setAccent(DEFAULT_TOKENS.accent);
    setAccentHover(DEFAULT_TOKENS.accentHover);
    setBackground(DEFAULT_TOKENS.background);
    setSurface(DEFAULT_TOKENS.surface);
    setTextColor(DEFAULT_TOKENS.text);
    setRadius(DEFAULT_TOKENS.radius);

    setNotification("Se restauraron los tokens oficiales de Mocter SaaS.");
    setTimeout(() => setNotification(null), 4000);
  };

  const sampleRows: TokenRow[] = [
    {
      token: "--dsn-background",
      layer: "Semántico (Fondo)",
      dark: background,
      light: "#f9f9f9",
      wcagRatio: `${textContrast.ratio}:1`,
    },
    {
      token: "--dsn-surface",
      layer: "Semántico (Superficie)",
      dark: surface,
      light: "#ffffff",
      wcagRatio: `${surfaceContrast.ratio}:1`,
    },
    {
      token: "--dsn-accent",
      layer: "Marca (Acento Cian)",
      dark: accent,
      light: "#0891b2",
      wcagRatio: `${accentContrast.ratio}:1`,
    },
    {
      token: "--dsn-text",
      layer: "Semántico (Texto Principal)",
      dark: textColor,
      light: "#09090b",
      wcagRatio: `${textContrast.ratio}:1`,
    },
    {
      token: "--primitive-radius-md",
      layer: "Primitivo (Radio Bordes)",
      dark: radius,
      light: radius,
      wcagRatio: "N/A (Geometría)",
    },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {notification && (
          <Alert variant="info" role="status" className="items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <AlertDescription>{notification}</AlertDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNotification(null)}>
              Cerrar
            </Button>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--dsn-text-secondary)]">
            Alterna entre modo claro y oscuro para validar contraste WCAG 2.2 AA en cada componente.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Tema Activo</span>
            <ThemeToggle />
          </div>
        </div>

        <Tabs defaultValue="tokens" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="tokens">Tokens Y Paleta</TabsTrigger>
            <TabsTrigger value="primitives">Primitivas Atómicas</TabsTrigger>
            <TabsTrigger value="overlays">Modales Y Overlays</TabsTrigger>
            <TabsTrigger value="composites">Compuestos Y Tablas</TabsTrigger>
          </TabsList>

          {/* PESTAÑA 1: EDITOR DE TOKENS Y TABLA */}
          <TabsContent value="tokens" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
                    <Sliders className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle>Editor De Tokens Y Paleta En Caliente</CardTitle>
                    <CardDescription>
                      Ajusta la capa semántica y de marca con validación algorítmica WCAG 2.2 AA.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" onClick={handleResetDefaults}>
                    <RotateCcw className="h-4 w-4 text-[var(--dsn-accent)]" aria-hidden="true" />
                    <span>Restaurar Predeterminados</span>
                  </Button>
                  <Button type="button" variant="primary" onClick={handleApplyTokens}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    <span>Aplicar Al Sistema En Caliente</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <FormField label="Color De Acento (--dsn-accent)">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accent}
                        onChange={(e) => setAccent(e.target.value)}
                        className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                        aria-label="Selector de Color de Acento"
                      />
                      <Input
                        value={accent}
                        onChange={(e) => setAccent(e.target.value)}
                        className="font-mono"
                        placeholder="#22d3ee"
                      />
                    </div>
                  </FormField>

                  <FormField label="Color De Acento Hover (--dsn-accent-hover)">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentHover}
                        onChange={(e) => setAccentHover(e.target.value)}
                        className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                        aria-label="Selector de Color Acento Hover"
                      />
                      <Input
                        value={accentHover}
                        onChange={(e) => setAccentHover(e.target.value)}
                        className="font-mono"
                        placeholder="#67e8f9"
                      />
                    </div>
                  </FormField>

                  <FormField label="Fondo Semántico (--dsn-background)">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                        aria-label="Selector de Color de Fondo"
                      />
                      <Input
                        value={background}
                        onChange={(e) => setBackground(e.target.value)}
                        className="font-mono"
                        placeholder="#0a0a0b"
                      />
                    </div>
                  </FormField>

                  <FormField label="Superficie (--dsn-surface)">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={surface}
                        onChange={(e) => setSurface(e.target.value)}
                        className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                        aria-label="Selector de Color de Superficie"
                      />
                      <Input
                        value={surface}
                        onChange={(e) => setSurface(e.target.value)}
                        className="font-mono"
                        placeholder="#121214"
                      />
                    </div>
                  </FormField>

                  <FormField label="Texto Principal (--dsn-text)">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                        aria-label="Selector de Color de Texto"
                      />
                      <Input
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="font-mono"
                        placeholder="#ededef"
                      />
                    </div>
                  </FormField>

                  <FormField label="Geometría De Bordes (--primitive-radius-md)">
                    <Select value={radius} onChange={(e) => setRadius(e.target.value)}>
                      <option value="0px">0px · Cuadrado Estricto</option>
                      <option value="0.375rem">6px · Suave Predeterminado</option>
                      <option value="0.5rem">8px · Estándar Mocter</option>
                      <option value="0.75rem">12px · Redondeado Moderno</option>
                      <option value="1.25rem">20px · Orgánico / Extendido</option>
                    </Select>
                  </FormField>
                </div>

                <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/80 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--dsn-text)]">
                      Certificación De Accesibilidad WCAG 2.2 AA En Vivo
                    </span>
                    <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                      Ratios obligatorios: 4.5:1 Texto · 3.0:1 UI
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">Texto vs Fondo</p>
                        <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                          {textContrast.ratio}:1
                        </p>
                      </div>
                      <Badge variant={textContrast.valid ? "success" : "error"}>
                        {textContrast.valid ? "Cumple AA" : "Falla AA"}
                      </Badge>
                    </div>

                    <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">Acento vs Fondo (UI)</p>
                        <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                          {accentContrast.ratio}:1
                        </p>
                      </div>
                      <Badge variant={accentContrast.valid ? "success" : "warning"}>
                        {accentContrast.valid ? "Cumple UI (3:1)" : "Falla UI"}
                      </Badge>
                    </div>

                    <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-[var(--dsn-text-secondary)]">Texto vs Superficie</p>
                        <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                          {surfaceContrast.ratio}:1
                        </p>
                      </div>
                      <Badge variant={surfaceContrast.valid ? "success" : "error"}>
                        {surfaceContrast.valid ? "Cumple AA" : "Falla AA"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--dsn-accent)]" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                    Catálogo Documentado De Tokens En 3 Capas
                  </h2>
                </div>
                <span className="text-xs text-[var(--dsn-text-secondary)]">
                  Primitivos · Semánticos · Marca
                </span>
              </div>

              <DataTable
                columns={[
                  { key: "token", header: "Token CSS", sortable: true, filterable: true },
                  { key: "layer", header: "Capa Arquitectónica", sortable: true, filterable: true },
                  { key: "dark", header: "Valor Activo (Oscuro)" },
                  { key: "light", header: "Valor Claro (Semántico)" },
                  { key: "wcagRatio", header: "Contraste WCAG 2.2 AA", isNumeric: true, sortable: true },
                ]}
                rows={sampleRows}
                emptyMessage="Sin tokens registrados"
              />
            </section>
          </TabsContent>

          {/* PESTAÑA 2: PRIMITIVAS ATÓMICAS */}
          <TabsContent value="primitives" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[var(--dsn-accent)]" aria-hidden="true" />
                    Botones Y Badges
                  </CardTitle>
                  <CardDescription>
                    Variantes semánticas de `Button` (incluyendo loading y AI) y `Badge`.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary">Acción Principal</Button>
                    <Button variant="secondary">Secundario</Button>
                    <Button variant="outline">Contorno</Button>
                    <Button variant="ghost">Sutil</Button>
                    <Button variant="ai">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Mejorar con AI</span>
                    </Button>
                    <Button variant="destructive">Eliminar</Button>
                    <Button variant="warning">Advertencia</Button>
                    <Button variant="primary" loading loadingText="Guardando...">
                      Guardar
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--dsn-border)]">
                    <Badge variant="default">Neutro</Badge>
                    <Badge variant="accent">Acento Cian</Badge>
                    <Badge variant="success">Activo</Badge>
                    <Badge variant="warning">Pendiente</Badge>
                    <Badge variant="error">Error</Badge>
                    <Badge variant="amber">Ámbar</Badge>
                    <Badge variant="purple">Púrpura</Badge>
                    <Badge variant="outline">Contorno</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Controles De Formulario</CardTitle>
                  <CardDescription>
                    `Input`, `Textarea`, `Select` Mobile First, `CustomSelect` Radix, `Checkbox` y `Switch`.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField label="Nombre Del Comercio" htmlFor="ds-store-name" required>
                    <Input
                      id="ds-store-name"
                      leftIcon={<Search className="h-4 w-4" />}
                      defaultValue="Comercio Demostración Mocter"
                    />
                  </FormField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Plan (Select Nativo)" htmlFor="ds-native-select">
                      <Select
                        id="ds-native-select"
                        value={sampleSelect}
                        onChange={(e) => setSampleSelect(e.target.value)}
                      >
                        <option value="starter">Plan Inicial</option>
                        <option value="pro">Plan Profesional</option>
                        <option value="enterprise">Empresarial</option>
                      </Select>
                    </FormField>

                    <FormField label="Tema (CustomSelect Radix)">
                      <CustomSelect value={sampleCustomSelect} onValueChange={setSampleCustomSelect}>
                        <CustomSelectTrigger>
                          <CustomSelectValue placeholder="Elegir acento" />
                        </CustomSelectTrigger>
                        <CustomSelectContent>
                          <CustomSelectItem value="cyan">Cian Canónico</CustomSelectItem>
                          <CustomSelectItem value="amber">Ámbar Analítica</CustomSelectItem>
                          <CustomSelectItem value="purple">Púrpura IA</CustomSelectItem>
                        </CustomSelectContent>
                      </CustomSelect>
                    </FormField>
                  </div>

                  <FormField label="Descripción Del Negocio" htmlFor="ds-desc">
                    <Textarea
                      id="ds-desc"
                      rows={3}
                      defaultValue="Tienda especializada en atención automatizada por WhatsApp."
                    />
                  </FormField>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--dsn-border)]">
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                      <Checkbox checked={sampleChecked} onCheckedChange={(v) => setSampleChecked(v === true)} />
                      <span>Aceptar Políticas Operativas</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
                      <Switch checked={sampleSwitched} onCheckedChange={setSampleSwitched} />
                      <span>Asistente Activo</span>
                    </label>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Alertas Semánticas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Alert variant="info">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <AlertTitle>Información De Sistema</AlertTitle>
                      <AlertDescription>Sincronización de catálogo completada.</AlertDescription>
                    </div>
                  </Alert>
                  <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <AlertTitle>Operación Exitosa</AlertTitle>
                      <AlertDescription>Los cambios fueron persistidos correctamente.</AlertDescription>
                    </div>
                  </Alert>
                  <Alert variant="warning">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <AlertTitle>Atención Requerida</AlertTitle>
                      <AlertDescription>Tu suscripción vence en 3 días.</AlertDescription>
                    </div>
                  </Alert>
                  <Alert variant="error">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <AlertTitle>Error De Validación</AlertTitle>
                      <AlertDescription>El contraste seleccionado no supera 4.5:1.</AlertDescription>
                    </div>
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Skeleton Y Estado Vacío</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <EmptyState
                    icon={<Package className="h-5 w-5" aria-hidden="true" />}
                    title="Sin Productos Registrados"
                    description="Agrega tu primer producto para habilitar el catálogo conversacional."
                    action={<Button size="sm">Registrar Producto</Button>}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PESTAÑA 3: MODALES, DRAWERS, TOOLTIPS Y MENÚS */}
          <TabsContent value="overlays" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Primitivas De Superposición Y Navegación Accesible</CardTitle>
                <CardDescription>
                  `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip` y `ConfirmationModal` con trampa de foco y cierre con `Escape`.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="primary">Abrir Dialog Estándar</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Diálogo Modal Accesible</DialogTitle>
                      <DialogDescription>
                        Gestionado por Radix Dialog con trampa de foco y retorno automático.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <FormField label="Nombre Del Canal" htmlFor="modal-channel">
                        <Input id="modal-channel" placeholder="WhatsApp Principal" />
                      </FormField>
                    </div>
                    <DialogFooter>
                      <Button variant="outline">Cerrar</Button>
                      <Button variant="primary">Confirmar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="secondary">Abrir Sheet Lateral</Button>
                  </SheetTrigger>
                  <SheetContent side="right">
                    <SheetHeader>
                      <SheetTitle>Inspector Lateral</SheetTitle>
                      <SheetDescription>Panel deslizante adaptable a móvil y escritorio.</SheetDescription>
                    </SheetHeader>
                    <p className="text-xs text-[var(--dsn-text-secondary)]">
                      Ideal para filtros avanzados, previsualizaciones y cajones de navegación móvil.
                    </p>
                    <SheetFooter>
                      <Button variant="primary">Aplicar Filtros</Button>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>

                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Abrir ConfirmationModal</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                      <span>Menú Contextual</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Acciones Del Registro</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Editar Registro</DropdownMenuItem>
                    <DropdownMenuItem>Duplicar Configuración</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-rose-500">Archivar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost">Pasa el Cursor (Tooltip)</Button>
                  </TooltipTrigger>
                  <TooltipContent>Ayuda contextual accesible vía teclado y puntero.</TooltipContent>
                </Tooltip>
              </CardContent>
              <CardFooter className="justify-between text-xs text-[var(--dsn-text-secondary)]">
                <span>Todos los overlays respetan cierre con ESC y foco visible.</span>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* PESTAÑA 4: COMPUESTOS TRANSVERSALES */}
          <TabsContent value="composites" className="space-y-6">
            <WorkspaceDataTable
              data={DEMO_PRODUCTS}
              getRowKey={(row) => row.id}
              searchKeys={["name", "category"]}
              showDensityToggle
              columns={[
                { key: "id", header: "Código", isNumeric: true, sortable: true, renderCell: (r) => r.id },
                { key: "name", header: "Producto", sortable: true, renderCell: (r) => r.name },
                { key: "category", header: "Categoría", sortable: true, renderCell: (r) => r.category },
                { key: "price", header: "Precio", isNumeric: true, align: "right", renderCell: (r) => r.price },
                {
                  key: "status",
                  header: "Estado",
                  renderCell: (r) => (
                    <Badge variant={r.status === "active" ? "success" : "warning"}>
                      {r.status === "active" ? "Activo" : "Borrador"}
                    </Badge>
                  ),
                },
              ]}
            />

            <Card>
              <CardHeader>
                <CardTitle>Simulador De Barra De Guardado (`FormSaveBar`)</CardTitle>
                <CardDescription>
                  Activa el estado sucio para previsualizar la barra flotante y la guardia de descarte.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" onClick={() => setFormDirty((prev) => !prev)}>
                  {formDirty ? "Simular Formulario Limpio" : "Simular Cambios Pendientes"}
                </Button>
                <FormSaveBar
                  isDirty={formDirty}
                  sectionName="Catálogo Vivo"
                  onSave={() => setFormDirty(false)}
                  onDiscard={() => setFormDirty(false)}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ConfirmationModal
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Confirmación De Prueba"
          subtitle="Demostración de ConfirmationModal construido sobre Dialog de @mocter/ui."
          variant="warning"
          details={[
            { label: "Componente", value: "ConfirmationModal", mono: true },
            { label: "Sistema", value: "@mocter/ui" },
          ]}
          warningTitle="Acción Reversible De Demostración"
          warningMessage="Este modal valida contraste WCAG 2.2 AA, trampa de foco y cierre con Escape."
          confirmText="Entendido"
          cancelText="Cancelar"
        />
      </div>
    </TooltipProvider>
  );
}
