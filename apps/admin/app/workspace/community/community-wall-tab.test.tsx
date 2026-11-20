import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TenantCommunityDetailDto } from "@mocter/domain";
import { CommunityWallTab } from "./community-wall-tab";

describe("SPEC-15-D11..D14 · CommunityWallTab", () => {
  const communities: TenantCommunityDetailDto[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Red Mayorista Sur",
      slug: "red-mayorista-sur",
      description: "Distribución oficial",
      category: "Moda",
      visibility: "request_to_join",
      sharePolicy: "leaders_only",
      requireShareApproval: true,
      moderationMode: "pre",
      inviteCode: "SUR2026",
      status: "active",
      originatorClientId: "11111111-1111-4111-8111-111111111111",
      originatorName: "Tienda Fundadora",
      myRole: "originator",
      membersCount: 4,
      sharesCount: 1,
      pendingRequestsCount: 0,
      pendingSharesCount: 0,
      pendingPostsCount: 0,
      joinedAt: "2026-11-16T10:00:00.000Z",
      members: [],
      joinRequests: [],
      invitations: [],
      promotions: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/tenant/community/sharing-profile")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: {
                clientId: "11111111-1111-4111-8111-111111111111",
                sharePhone: false,
                shareEmail: true,
                shareAddress: false,
                shareSocialLinks: true,
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes("/api/tenant/community/posts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: [
                {
                  id: "post-pinned-1",
                  organizationId: "33333333-3333-4333-8333-333333333333",
                  organizationName: "Red Mayorista Sur",
                  body: '<p style="text-align: center;"><strong>Gran Lanzamiento</strong></p>',
                  bodyFormat: "html",
                  mediaId: "media-1",
                  imageUrl: "/api/tenant/community/posts/media/media-1",
                  videoEmbedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
                  isPinned: true,
                  pinnedAt: "2026-11-19T12:00:00.000Z",
                  status: "published",
                  publishedAt: "2026-11-19T10:00:00.000Z",
                  createdAt: "2026-11-19T10:00:00.000Z",
                  authorRole: "originator",
                  author: {
                    clientId: "11111111-1111-4111-8111-111111111111",
                    displayName: "Tienda Fundadora",
                    contactEmail: "hola@fundadora.co",
                  },
                  replies: [
                    {
                      id: "reply-1",
                      postId: "post-pinned-1",
                      authorClientId: "22222222-2222-4222-8222-222222222222",
                      authorDisplayName: "Tienda Aliada",
                      body: "¡Excelente noticia! 🎉",
                      createdAt: "2026-11-19T11:00:00.000Z",
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza editor WYSIWYG social sin HTML crudo, post fijado, imagen, video y respuestas con selector de emojis", async () => {
    render(
      <CommunityWallTab
        communities={communities}
        locale="es"
        isOwner={true}
        currentClientId="11111111-1111-4111-8111-111111111111"
        onSuccessToast={vi.fn()}
        onErrorToast={vi.fn()}
      />,
    );

    // Barra WYSIWYG limpia (alineación, video, imagen, AI; sin toggle de código HTML)
    expect(screen.getByLabelText("Negrita")).toBeTruthy();
    expect(screen.getByLabelText("Centrar")).toBeTruthy();
    expect(screen.getByLabelText("Incrustar Video")).toBeTruthy();
    expect(screen.getByLabelText("Adjuntar Imagen")).toBeTruthy();
    expect(screen.getByText("Mejorar con AI")).toBeTruthy();
    expect(screen.queryByText("Código HTML")).toBeNull();

    // Post fijado, imagen, video y respuesta existente
    await waitFor(() => {
      expect(screen.getByText("Publicación Fijada")).toBeTruthy();
      expect(screen.getByText("Gran Lanzamiento")).toBeTruthy();
      expect(screen.getByText("¡Excelente noticia! 🎉")).toBeTruthy();
    });

    // Abrir selector de emojis e insertar emoji en el borrador de respuesta
    fireEvent.click(screen.getByLabelText("Insertar Emoji"));
    fireEvent.click(screen.getByText("🚀"));
    const replyInput = screen.getByPlaceholderText(
      "Escribe una respuesta o agrega un emoji...",
    ) as HTMLInputElement;
    expect(replyInput.value).toBe("🚀");

    // Verificar imagen con proporción acotada (sin object-cover que recorte el producto)
    const postImg = screen.getByAltText("Tienda Fundadora");
    expect(postImg.className).toContain("object-contain");
    expect(postImg.className).toContain("max-h-[340px]");
    expect(postImg.className).not.toContain("object-cover");
  });

  it("T-11 · inserta enlaces duales (texto vinculado y URL cruda) y permite editar publicación propia cerrando el modal automáticamente", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

    render(
      <CommunityWallTab
        communities={communities}
        locale="es"
        isOwner={true}
        currentClientId="11111111-1111-4111-8111-111111111111"
        onSuccessToast={vi.fn()}
        onErrorToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Gran Lanzamiento")).toBeTruthy();
    });

    // 1. Inserción dual de enlace en el compositor: primero con texto personalizado, luego como URL cruda
    const linkToggle = screen.getAllByLabelText("Insertar Enlace")[0];
    fireEvent.click(linkToggle);

    fireEvent.change(screen.getByLabelText("Texto del Enlace (Opcional)"), {
      target: { value: "Ver Catálogo" },
    });
    fireEvent.change(screen.getByLabelText("URL de Destino"), {
      target: { value: "https://mocter.co/catalogo" },
    });
    fireEvent.click(screen.getByText("Aplicar"));

    const editorTextbox = screen.getAllByRole("textbox", {
      name: "Contenido de Publicación en el Muro",
    })[0];
    expect(editorTextbox.innerHTML).toContain('href="https://mocter.co/catalogo"');
    expect(editorTextbox.innerHTML).toContain(">Ver Catálogo</a>");

    // URL cruda sin texto personalizado
    fireEvent.click(linkToggle);
    fireEvent.change(screen.getByLabelText("URL de Destino"), {
      target: { value: "https://mocter.co/directo" },
    });
    fireEvent.click(screen.getByText("Aplicar"));
    expect(editorTextbox.innerHTML).toContain('href="https://mocter.co/directo"');
    expect(editorTextbox.innerHTML).toContain(">https://mocter.co/directo</a>");

    // 2. Edición de publicación propia desde botón Pencil -> PATCH y cierre automático del modal
    fireEvent.click(screen.getByLabelText("Editar Publicación"));

    await waitFor(() => {
      expect(screen.getByText("Editar Publicación del Muro")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Guardar Cambios"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tenant/community/posts/post-pinned-1",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(screen.queryByText("Editar Publicación del Muro")).toBeNull();
    });
  });
});
