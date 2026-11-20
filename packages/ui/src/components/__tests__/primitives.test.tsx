import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FormField,
  Input,
  Label,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
  cn,
} from "../../index";

describe("@mocter/ui · Primitivas Atómicas (SPEC-21 T-01)", () => {
  afterEach(() => {
    cleanup();
  });

  it("cn() combina clases y resuelve colisiones Tailwind", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("Button soporta variantes --dsn-*, estado loading y asChild", () => {
    const onClick = vi.fn();
    render(
      <div>
        <Button variant="primary" onClick={onClick}>
          Guardar Cambios
        </Button>
        <Button variant="secondary" loading loadingText="Guardando...">
          Guardar
        </Button>
        <Button variant="ai" asChild>
          <a href="/ai">Mejorar con AI</a>
        </Button>
      </div>,
    );

    const primaryBtn = screen.getByRole("button", { name: "Guardar Cambios" });
    expect(primaryBtn.className).toContain("bg-[var(--dsn-accent)]");
    fireEvent.click(primaryBtn);
    expect(onClick).toHaveBeenCalledTimes(1);

    const loadingBtn = screen.getByRole("button", { name: "Guardando..." });
    expect(loadingBtn.hasAttribute("disabled")).toBe(true);
    expect(loadingBtn.getAttribute("aria-busy")).toBe("true");

    const aiLink = screen.getByRole("link", { name: "Mejorar con AI" });
    expect(aiLink.getAttribute("href")).toBe("/ai");
    expect(aiLink.className).toContain("text-[var(--dsn-accent)]");
  });

  it("Input, Textarea, Label y FormField renderizan accesiblemente sin uppercase", () => {
    render(
      <FormField label="Nombre del Producto" htmlFor="product-name" required hint="Máximo 80 caracteres">
        <Input id="product-name" placeholder="Ej. Camiseta Negra" />
      </FormField>,
    );

    const label = screen.getByText("Nombre del Producto");
    expect(label.closest("label")?.className).not.toContain("uppercase");
    const input = screen.getByLabelText(/Nombre del Producto/) as HTMLInputElement;
    expect(input.placeholder).toBe("Ej. Camiseta Negra");

    render(<Textarea aria-label="Descripción" error />);
    const textarea = screen.getByLabelText("Descripción");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
  });

  it("Select nativo Mobile First dispara onChange con fireEvent.change", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Estado del Pedido" defaultValue="pending" onChange={onChange}>
        <option value="pending">Pendiente</option>
        <option value="paid">Pagado</option>
      </Select>,
    );

    const select = screen.getByLabelText("Estado del Pedido") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "paid" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(select.value).toBe("paid");
  });

  it("Checkbox y Switch exponen roles ARIA y cambian estado al clic", () => {
    const onCheck = vi.fn();
    const onToggle = vi.fn();
    render(
      <div>
        <Label htmlFor="terms-check">Aceptar Términos</Label>
        <Checkbox id="terms-check" onCheckedChange={onCheck} />
        <Switch aria-label="Activar Bot" onCheckedChange={onToggle} />
      </div>,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onCheck).toHaveBeenCalledWith(true);

    const switchEl = screen.getByRole("switch", { name: "Activar Bot" });
    fireEvent.click(switchEl);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("Dialog aplica role='dialog', aria-modal='true' y cierra con Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>Actualiza los datos del catálogo.</DialogDescription>
          </DialogHeader>
          <p>Contenido del modal</p>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Editar Producto")).toBeDefined();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Sheet renderiza panel lateral accesible", () => {
    render(
      <Sheet open={true} onOpenChange={vi.fn()}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menú Principal</SheetTitle>
            <SheetDescription>Navegación del espacio</SheetDescription>
          </SheetHeader>
          <a href="/workspace">Tablero</a>
        </SheetContent>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Menú Principal")).toBeDefined();
  });

  it("Tabs soporta cambio de pestañas controlado", () => {
    const onValueChange = vi.fn();
    render(
      <Tabs value="general" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="avanzado">Avanzado</TabsTrigger>
        </TabsList>
        <TabsContent value="general">Panel General</TabsContent>
        <TabsContent value="avanzado">Panel Avanzado</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole("tablist")).toBeDefined();
    expect(screen.getByText("Panel General")).toBeDefined();
    const tab2 = screen.getByRole("tab", { name: "Avanzado" });
    expect(tab2.getAttribute("aria-selected")).toBe("false");
    fireEvent.mouseDown(tab2, { button: 0 });
    fireEvent.click(tab2);
    expect(onValueChange).toHaveBeenCalledWith("avanzado");
  });

  it("Badge, Alert, Card, EmptyState, Skeleton, Tooltip y DropdownMenu se renderizan correctamente", () => {
    render(
      <TooltipProvider>
        <Card>
          <CardHeader>
            <CardTitle>Resumen Operativo</CardTitle>
            <CardDescription>Métricas de hoy</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="accent">Activo</Badge>
            <Alert variant="warning">
              <AlertTitle>Atención</AlertTitle>
              <AlertDescription>Verifica la configuración.</AlertDescription>
            </Alert>
            <Skeleton className="h-4 w-24" />
            <EmptyState
              title="Sin Registros"
              description="Crea el primer elemento."
              action={<Button size="sm">Crear</Button>}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  Ayuda
                </Button>
              </TooltipTrigger>
              <TooltipContent>Información adicional</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Acciones
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Duplicar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
          <CardFooter>Pie</CardFooter>
        </Card>
      </TooltipProvider>,
    );

    expect(screen.getByText("Resumen Operativo")).toBeDefined();
    expect(screen.getByText("Activo")).toBeDefined();
    expect(screen.getByText("Atención")).toBeDefined();
    expect(screen.getByText("Sin Registros")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ayuda" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Acciones" })).toBeDefined();
  });
});
