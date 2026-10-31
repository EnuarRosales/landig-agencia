import { describe, it, expect, vi } from "vitest";
import {
  AdminOnboardingAndLimitsService,
  RESERVED_MOCTER_LEAD_LABELS,
} from "./onboarding-and-limits.service";
import {
  ChatwootProvisioningService,
  type IChatwootPlatformGateway,
} from "./chatwoot-provisioning.service";
import { CatalogAndMediaService } from "./catalog-and-media.service";
import {
  TransactionalNotificationsAndLeadsService,
  sanitizeEmailHtml,
} from "./notifications-and-leads.service";

const PLANS_CATALOG = [
  { id: "019a0000-0000-7000-8000-000000000100", code: "free", status: "active" as const },
  { id: "019a0000-0000-7000-8000-000000000101", code: "starter", status: "active" as const },
  { id: "019a0000-0000-7000-8000-000000000102", code: "legacy", status: "retired" as const },
];

describe("Fase 2 · ADM-001 T-07..T-10 (Onboarding, Invitaciones, Celdas y Planes)", () => {
  it("T-07: conserva el avance y plan_code tras interrumpir, no crea cliente antes del paso de negocio y deja al inquilino operativo con 1 producto, bot preset, canal web y pendientes opcionales no bloqueantes", () => {
    const svc = new AdminOnboardingAndLimitsService();

    // Paso interrumpido: usuario guarda borrador con plan_code 'starter'
    const draft = svc.saveOrResumeOnboardingDraft("user-1", {
      planCode: "starter",
      displayName: "Tienda Andina",
      currentStep: "business",
    });
    expect(draft.clientId).toBeNull();
    expect(draft.planCode).toBe("starter");

    // Retoma tras interrumpir
    const resumed = svc.getOnboardingSession("user-1");
    expect(resumed?.draftPayload.displayName).toBe("Tienda Andina");
    expect(resumed?.clientId).toBeNull();

    // Completa el onboarding en sesión corta (< 5 min)
    const completed = svc.completeOnboarding(
      {
        userId: "user-1",
        userEmail: "owner@tiendaandina.co",
        emailVerified: true,
        hasActiveMembership: false,
        ownsLiveTenant: false,
        business: {
          displayName: "Tienda Andina",
          slug: "tienda-andina",
        },
        firstProduct: {
          name: "Mochila Wayuu",
          description: "Tejida a mano",
          priceCents: 180_000_00,
        },
      },
      PLANS_CATALOG,
    );

    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.data.planCode).toBe("starter");
    expect(completed.data.planId).toBe("019a0000-0000-7000-8000-000000000101");
    expect(completed.data.currency).toBe("COP");
    expect(completed.data.locale).toBe("es");
    expect(completed.data.timezone).toBe("America/Bogota");
    expect(completed.data.firstProduct.name).toBe("Mochila Wayuu");
    expect(completed.data.botConfig.webchatActive).toBe(true);
    expect(completed.data.botConfig.preset).toBe("natural_rhythm");
    expect(completed.data.seededLabels).toHaveLength(4);
    expect(completed.data.optionalPendingTasks).toContain("connect_whatsapp");
  });

  it("T-08: rechaza invitar tenant_owner, rechaza invitaciones vencidas, rechaza si el invitado ya tiene membresía activa y asigna tenant_agent", () => {
    const svc = new AdminOnboardingAndLimitsService();

    // No se puede invitar como tenant_owner
    const ownerAttempt = svc.issueTenantInvitation({
      clientId: "client-1",
      email: "agent@tienda.co",
      invitedByUserId: "owner-1",
      requestedRole: "tenant_owner",
      maxTenantAgentsAllowed: 3,
      currentActiveAgentsCount: 0,
    });
    expect(ownerAttempt.ok).toBe(false);

    // Invitación vencida no crea membresía
    const expiredInvite = svc.issueTenantInvitation({
      clientId: "client-1",
      email: "expired@tienda.co",
      invitedByUserId: "owner-1",
      ttlMs: -1000,
      maxTenantAgentsAllowed: 3,
      currentActiveAgentsCount: 0,
    });
    expect(expiredInvite.ok).toBe(true);
    if (!expiredInvite.ok) return;

    const expiredAccept = svc.acceptTenantInvitation({
      rawToken: expiredInvite.data.rawToken,
      userId: "user-exp",
      userEmail: "expired@tienda.co",
      userActiveClientId: null,
    });
    expect(expiredAccept.ok).toBe(false);
    if (!expiredAccept.ok) {
      expect(expiredAccept.code).toBe("INVITATION_EXPIRED");
    }

    // Invitación válida rechaza si ya tiene membresía activa en otro inquilino
    const validInvite = svc.issueTenantInvitation({
      clientId: "client-1",
      email: "agent@tienda.co",
      invitedByUserId: "owner-1",
      maxTenantAgentsAllowed: 3,
      currentActiveAgentsCount: 0,
    });
    expect(validInvite.ok).toBe(true);
    if (!validInvite.ok) return;

    const busyUserAccept = svc.acceptTenantInvitation({
      rawToken: validInvite.data.rawToken,
      userId: "user-busy",
      userEmail: "agent@tienda.co",
      userActiveClientId: "other-client-99",
    });
    expect(busyUserAccept.ok).toBe(false);

    // Usuario libre entra como tenant_agent
    const okAccept = svc.acceptTenantInvitation({
      rawToken: validInvite.data.rawToken,
      userId: "user-free",
      userEmail: "agent@tienda.co",
      userActiveClientId: null,
    });
    expect(okAccept.ok).toBe(true);
    if (okAccept.ok) {
      expect(okAccept.data.assignedRole).toBe("tenant_agent");
    }
  });

  it("T-09: el inquilino 101 abre una celda nueva automáticamente y toda consulta sin resolución previa de celda se rechaza", () => {
    const svc = new AdminOnboardingAndLimitsService();
    svc.registerCell({
      id: "cell-01-id",
      code: "cell-01",
      status: "active",
      maxClients: 100,
      currentClients: 100,
    });

    const allocated = svc.allocateCellForNewTenant();
    expect(allocated.newlyProvisioned).toBe(true);
    expect(allocated.code).toBe("cell-02");
    expect(allocated.currentClients).toBe(1);

    // Consulta sin resolución de celda se rechaza
    const rejectedQuery = svc.executeTenantScopedQuery("unrouted-client", null, () => "rows");
    expect(rejectedQuery.ok).toBe(false);
    if (!rejectedQuery.ok) {
      expect(rejectedQuery.code).toBe("UNRESOLVED_CELL_ROUTING");
    }
  });

  it("T-10: un plan retirado no se ofrece en autoservicio; los overrides numéricos y de capacidad aplican solo a su inquilino; el exceso de productos, tenant_agent o bytes se rechaza", () => {
    const svc = new AdminOnboardingAndLimitsService();

    // Plan retirado rechazado en autoservicio
    const retiredRes = svc.completeOnboarding(
      {
        userId: "user-ret",
        userEmail: "ret@tienda.co",
        emailVerified: true,
        hasActiveMembership: false,
        ownsLiveTenant: false,
        planCode: "legacy",
        business: { displayName: "Legacy Shop", slug: "legacy-shop" },
      },
      PLANS_CATALOG,
    );
    expect(retiredRes.ok).toBe(false);
    if (!retiredRes.ok) {
      expect(retiredRes.code).toBe("PLAN_RETIRED");
    }

    // Plan free tiene 0 tenant_agent: intentar invitar 1 agente falla
    const freeAgentAttempt = svc.issueTenantInvitation({
      clientId: "client-free",
      email: "a@b.co",
      invitedByUserId: "owner-1",
      maxTenantAgentsAllowed: 0,
      currentActiveAgentsCount: 0,
    });
    expect(freeAgentAttempt.ok).toBe(false);

    // Exceso de productos o bytes se rechaza; override aplica solo a su inquilino
    const now = new Date();
    const overrides = [
      {
        clientId: "client-vip",
        dimension: "max_products" as const,
        value: 50,
        validFrom: new Date(now.getTime() - 10_000),
        validTo: null,
      },
    ];

    const normalClientQuota = svc.evaluateNumericQuota({
      clientId: "client-normal",
      dimension: "max_products",
      currentUsedValue: 10,
      incrementBy: 1,
      planLimits: { max_products: 10 },
      clientOverrides: overrides,
      now,
    });
    expect(normalClientQuota.ok).toBe(false);

    const vipClientQuota = svc.evaluateNumericQuota({
      clientId: "client-vip",
      dimension: "max_products",
      currentUsedValue: 10,
      incrementBy: 1,
      planLimits: { max_products: 10 },
      clientOverrides: overrides,
      now,
    });
    expect(vipClientQuota.ok).toBe(true);

    // Capacidad ausente se rechaza; override de capacidad aplica solo a su inquilino
    const featureGateDenied = svc.evaluateFeatureGate({
      clientId: "client-normal",
      featureKey: "custom_domain",
      planFeatureValues: { custom_domain: { enabled: false } },
      clientFeatureOverrides: [
        {
          clientId: "client-vip",
          featureKey: "custom_domain",
          enabled: true,
          validFrom: new Date(now.getTime() - 10_000),
          validTo: null,
        },
      ],
      now,
    });
    expect(featureGateDenied.ok).toBe(false);
  });
});

describe("Fase 2 · ADM-001 T-11, T-12 & CHW-001 (Aprovisionamiento Chatwoot y tenant_labels)", () => {
  it("T-11 & T-12: dos llamadas concurrentes producen una sola cuenta; failed vuelve a provisioning y reintentar no duplica cuenta ni usuario; active habilita SSO; etiquetas se sincronizan idempotentemente", async () => {
    let createAccountCalls = 0;
    let ensureUserCalls = 0;
    let shouldFailInboxOnce = true;

    const gateway: IChatwootPlatformGateway = {
      createAccount: vi.fn().mockImplementation(async () => {
        createAccountCalls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { accountId: 701 };
      }),
      ensureServiceUser: vi.fn().mockImplementation(async () => {
        ensureUserCalls += 1;
        return { userId: 901, accessToken: "cw_pat_secret_token" };
      }),
      ensureWebchatInbox: vi.fn().mockImplementation(async () => {
        if (shouldFailInboxOnce) {
          shouldFailInboxOnce = false;
          throw new Error("Temporary Chatwoot API 503");
        }
        return { inboxId: 301, websiteToken: "web_tok_123" };
      }),
      pushLabelToChatwoot: vi.fn().mockResolvedValue({ chatwootLabelId: 5001 }),
    };

    const cwSvc = new ChatwootProvisioningService(gateway);

    // Primer intento falla en el paso de inbox -> estado queda 'failed', pero cuenta y usuario ya quedaron registrados
    const firstAttempt = await cwSvc.provisionOrRetryAccount({
      clientId: "client-cw-1",
      tenantName: "Comercio CW",
      idempotencyKey: "idem-cw-1",
    });
    expect(firstAttempt.ok).toBe(false);
    expect(cwSvc.canIssueSsoForTenant("client-cw-1").ok).toBe(false);

    // Reintento con dos llamadas concurrentes: vuelve a provisioning, completa active sin duplicar cuenta ni usuario
    const [retryA, retryB] = await Promise.all([
      cwSvc.provisionOrRetryAccount({
        clientId: "client-cw-1",
        tenantName: "Comercio CW",
        idempotencyKey: "idem-cw-1",
      }),
      cwSvc.provisionOrRetryAccount({
        clientId: "client-cw-1",
        tenantName: "Comercio CW",
        idempotencyKey: "idem-cw-1",
      }),
    ]);

    expect(retryA.ok).toBe(true);
    expect(retryB.ok).toBe(true);
    expect(createAccountCalls).toBe(1);
    expect(ensureUserCalls).toBe(1);
    expect(cwSvc.canIssueSsoForTenant("client-cw-1").ok).toBe(true);

    // Sincronización idempotente de etiquetas y archivado al borrarse en Chatwoot
    const sync1 = cwSvc.syncLabelsFromChatwoot({
      clientId: "client-cw-1",
      remoteLabels: [{ id: 88, title: "vip-cliente", color: "#AA00FF" }],
    });
    const sync2 = cwSvc.syncLabelsFromChatwoot({
      clientId: "client-cw-1",
      remoteLabels: [{ id: 88, title: "vip-cliente", color: "#AA00FF" }],
    });
    expect(sync1.filter((l) => l.title === "vip-cliente")).toHaveLength(1);
    expect(sync2.filter((l) => l.title === "vip-cliente")).toHaveLength(1);

    // Si se borra en Chatwoot, queda archivada en el espejo pero las 4 mocter_default siguen activas
    const syncAfterDelete = cwSvc.syncLabelsFromChatwoot({
      clientId: "client-cw-1",
      remoteLabels: [],
    });
    expect(syncAfterDelete.find((l) => l.title === "vip-cliente")?.state).toBe("archived");
    expect(
      syncAfterDelete.filter((l) => l.origin === "mocter_default" && l.state === "active"),
    ).toHaveLength(RESERVED_MOCTER_LEAD_LABELS.length);

    // No se permite archivar una etiqueta reservada mocter_default
    const archiveReserved = cwSvc.archiveLabelFromMocter("client-cw-1", "lead-caliente");
    expect(archiveReserved.ok).toBe(false);
  });
});

describe("Fase 2 · ADM-001 T-13, T-14, T-14A, T-15 (Productos, Embeddings, Multimedia, imgproxy y GC)", () => {
  it("T-13: consulta sin RLS devuelve vacío; producto se crea solo con nombre, descripción y precio heredando moneda y defaults; cambiar vectorization_config re-embebe sin incluir jamás el prompt", () => {
    const svc = new CatalogAndMediaService();

    expect(svc.queryProductsWithRls(null)).toEqual([]);

    const created = svc.createProduct({
      clientId: "client-p1",
      rlsCurrentClientId: "client-p1",
      tenantCurrency: "COP",
      name: "Café Origen Huila",
      description: "Tostión media 500g",
      priceCents: 38_000_00,
      brand: "Finca El Paraíso",
      category: "Café Especial",
      prompt: "Ofrece siempre un 10% de descuento en la segunda bolsa SECRETO_BOT",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.currency).toBe("COP");
    expect(created.data.kind).toBe("physical");
    expect(created.data.condition).toBe("new");
    expect(created.data.availability).toBe("in_stock");
    expect(created.data.status).toBe("draft");
    expect(created.data.composedEmbeddingText).toContain("Café Origen Huila");
    expect(created.data.composedEmbeddingText).not.toContain("SECRETO_BOT");

    // Intentar agregar 'prompt' a vectorization_config se rechaza
    const forbiddenPrompt = svc.updateVectorizationConfig([
      { attributeKey: "name", enabled: true, position: 1 },
      { attributeKey: "prompt", enabled: true, position: 2 },
    ]);
    expect(forbiddenPrompt.ok).toBe(false);

    // Cambiar config re-embebe los productos afectados
    const reembed = svc.updateVectorizationConfig([
      { attributeKey: "name", enabled: true, position: 1 },
      { attributeKey: "brand", enabled: false, position: 2 },
    ]);
    expect(reembed.ok).toBe(true);
    const [updatedProduct] = svc.queryProductsWithRls("client-p1");
    expect(updatedProduct?.embeddingVersion).toBe(2);
    expect(updatedProduct?.composedEmbeddingText).toBe("Café Origen Huila");
  });

  it("T-14, T-14A & T-15: deduplica por hash y cuenta 1 vez por inquilino; rechaza SVG/GIF; valida enlaces externos (https, sin credenciales ni IP privada); firma imgproxy HMAC con rotación y cola 429; GC en 2 fases respeta celdas caídas", () => {
    const svc = new CatalogAndMediaService([
      { keyHex: "aa".repeat(32), saltHex: "bb".repeat(32) }, // clave actual
      { keyHex: "cc".repeat(32), saltHex: "dd".repeat(32) }, // clave anterior en ventana de rotación
    ]);

    // SVG y GIF se rechazan por magic bytes aunque tengan extensión .png
    const svgRes = svc.ingestAndLinkProductMedia({
      clientId: "client-m1",
      productId: "prod-1",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
      originalFilename: "fake.png",
    });
    expect(svgRes.ok).toBe(false);

    const gifRes = svc.ingestAndLinkProductMedia({
      clientId: "client-m1",
      productId: "prod-1",
      buffer: Buffer.from("GIF89a\x01\x00\x01\x00"),
      originalFilename: "anim.gif",
    });
    expect(gifRes.ok).toBe(false);

    // PNG válido compartido por 2 productos del mismo inquilino: 1 sola ficha, contado 1 sola vez en cuota, alt_text independiente
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const link1 = svc.ingestAndLinkProductMedia({
      clientId: "client-m1",
      productId: "prod-1",
      buffer: pngBytes,
      originalFilename: "foto.png",
      altText: "Vista frontal",
    });
    const link2 = svc.ingestAndLinkProductMedia({
      clientId: "client-m1",
      productId: "prod-2",
      buffer: pngBytes,
      originalFilename: "copia.png",
      altText: "Vista lateral",
    });

    expect(link1.ok && link2.ok).toBe(true);
    if (!link1.ok || !link2.ok) return;
    expect(link1.data.media.id).toBe(link2.data.media.id);
    expect(link2.data.deduplicatedGlobal).toBe(true);
    expect(link2.data.billedBytesForClient).toBe(pngBytes.length);
    expect(link1.data.altText).toBe("Vista frontal");
    expect(link2.data.altText).toBe("Vista lateral");

    // Enlaces externos: http, credenciales o IP privada se rechazan; enlace válido no consume cuota
    expect(
      svc.registerExternalMediaLink({
        clientId: "client-m1",
        productId: "prod-1",
        url: "http://youtube.com/watch?v=123",
        mediaKind: "video",
      }).ok,
    ).toBe(false);
    expect(
      svc.registerExternalMediaLink({
        clientId: "client-m1",
        productId: "prod-1",
        url: "https://user:pass@youtube.com/watch?v=123",
        mediaKind: "video",
      }).ok,
    ).toBe(false);
    expect(
      svc.registerExternalMediaLink({
        clientId: "client-m1",
        productId: "prod-1",
        url: "https://192.168.1.10/image.png",
        mediaKind: "image",
      }).ok,
    ).toBe(false);

    const extImg = svc.registerExternalMediaLink({
      clientId: "client-m1",
      productId: "prod-1",
      url: "https://cdn.ejemplo.co/catalogo/reloj.png",
      mediaKind: "image",
    });
    expect(extImg.ok).toBe(true);
    if (extImg.ok) {
      expect(extImg.data.billedBytesForClient).toBe(pngBytes.length); // externo suma 0 bytes
      const imported = svc.lazyImportExternalImageOnChannelDelivery(
        extImg.data.media.id,
        pngBytes,
      );
      expect(imported.ok).toBe(true);
      if (imported.ok) {
        expect(imported.data.storageType).toBe("internal");
      }
    }

    // imgproxy T-14A: firma HMAC-SHA256, rotación de claves, expiración 404, dimensión > 4096 rechazada, cola llena 429
    expect(
      svc.signImgproxyUrl({
        storageKey: link1.data.media.storageKey,
        width: 5000,
        height: 1000,
      }).ok,
    ).toBe(false);

    const signedOldKey = svc.signImgproxyUrl({
      storageKey: link1.data.media.storageKey,
      width: 800,
      height: 600,
      format: "avif",
      expiresUnixSec: 2_000_000_000,
      keyPairIndex: 1,
    });
    expect(signedOldKey.ok).toBe(true);
    if (!signedOldKey.ok) return;

    // Par anterior sigue siendo válido durante ventana de rotación
    expect(
      svc.verifyImgproxyRequest({
        signature: signedOldKey.data.signature,
        pathAndSource: signedOldKey.data.pathAndSource,
        nowUnixSec: 1_900_000_000,
      }),
    ).toEqual({ status: 200, format: "avif", framesDelivered: 1 });

    // Opciones alteradas -> 403
    expect(
      svc.verifyImgproxyRequest({
        signature: signedOldKey.data.signature,
        pathAndSource: signedOldKey.data.pathAndSource.replace("800", "900"),
        nowUnixSec: 1_900_000_000,
      }).status,
    ).toBe(403);

    // URL vencida -> 404
    expect(
      svc.verifyImgproxyRequest({
        signature: signedOldKey.data.signature,
        pathAndSource: signedOldKey.data.pathAndSource,
        nowUnixSec: 2_000_000_001,
      }).status,
    ).toBe(404);

    // Cola llena (100) -> 429
    expect(
      svc.verifyImgproxyRequest({
        signature: signedOldKey.data.signature,
        pathAndSource: signedOldKey.data.pathAndSource,
        currentQueueDepth: 100,
      }).status,
    ).toBe(429);

    // GC T-15: desvincular de prod-1 deja referencia en prod-2 -> no borra
    const gc1 = svc.unlinkProductMediaAndRunTwoPhaseGc({
      clientId: "client-m1",
      productId: "prod-1",
      mediaId: link1.data.media.id,
      allCellsHealthy: true,
    });
    expect(gc1.deletedFromStorage).toBe(false);
    expect(gc1.remainingReferences).toBe(1);

    // Desvincular de prod-2 con una celda caída -> no borra físicamente
    const gcUnhealthy = svc.unlinkProductMediaAndRunTwoPhaseGc({
      clientId: "client-m1",
      productId: "prod-2",
      mediaId: link1.data.media.id,
      allCellsHealthy: false,
    });
    expect(gcUnhealthy.deletedFromStorage).toBe(false);
    expect(gcUnhealthy.abortedByUnhealthyCell).toBe(true);

    // Cuando todas las celdas responden y hay 0 referencias -> borra el objeto
    const gcFinal = svc.unlinkProductMediaAndRunTwoPhaseGc({
      clientId: "client-m1",
      productId: "prod-2",
      mediaId: link1.data.media.id,
      allCellsHealthy: true,
    });
    expect(gcFinal.deletedFromStorage).toBe(true);
  });
});

describe("Fase 2 · NTF-001 (CA-NTF-01..08) & ADM-001 T-37, T-38 (Notificaciones RabbitMQ no bloqueante y /admin/leads)", () => {
  it("CA-NTF-01 a CA-NTF-08 y ADM-001 T-38: publicar plantilla retira la anterior; sanitiza HTML; valida variables; RabbitMQ caído no bloquea enqueueEmail; 3 fallos van a DLQ; idempotencia evita duplicados", () => {
    const ntf = new TransactionalNotificationsAndLeadsService();

    // T-03: cifrado AES-256-GCM de credenciales SMTP sin exponer secreto en claro
    const enc = ntf.encryptSmtpPassword("smtp-main", "super-secret-smtp-pass");
    expect(enc.maskedPreview).toBe("••••••••");
    expect(ntf.decryptSmtpPassword("smtp-main", enc.ciphertext, enc.keyId)).toBe(
      "super-secret-smtp-pass",
    );

    // CA-NTF-04: variable desconocida o faltante bloquea creación de plantilla
    const badTpl = ntf.createOrDraftTemplate({
      eventKey: "tenant.welcome",
      locale: "es",
      subject: "Hola {{tenant_name}}",
      bodyJson: {},
      bodyHtml: "<p>Faltan variables requeridas y hay {{variable_inventada}}</p>",
      actorRole: "platform_admin",
    });
    expect(badTpl.ok).toBe(false);

    // CA-NTF-01 y T-06: crear nueva versión v2 con script malicioso, sanitizar y publicar retirando v1
    const v2Draft = ntf.createOrDraftTemplate({
      eventKey: "tenant.welcome",
      locale: "es",
      subject: "Bienvenido v2 {{tenant_name}} - {{brand_name}}",
      bodyJson: {},
      bodyHtml:
        '<p onclick="evil()">Hola {{owner_name}}, entra a <a href="{{login_url}}">panel</a></p><script>steal()</script>',
      actorRole: "platform_admin",
    });
    expect(v2Draft.ok).toBe(true);
    if (!v2Draft.ok) return;
    expect(v2Draft.data.bodyHtml).not.toContain("<script>");
    expect(v2Draft.data.bodyHtml).not.toContain("onclick");

    const publishedV2 = ntf.publishTemplate(v2Draft.data.id);
    expect(publishedV2.ok).toBe(true);

    // CA-NTF-02, CA-NTF-05 y CA-NTF-08 (ADM-001 T-38): enqueueEmail de tenant.welcome con RabbitMQ caído
    const enq1 = ntf.enqueueEmail({
      eventKey: "tenant.welcome",
      recipient: "Owner@NuevoComercio.co",
      locale: "es",
      variables: {
        tenant_name: "Nuevo Comercio",
        owner_name: "Carlos",
        login_url: "https://admin.mocter.co/es",
        brand_name: "Mocter",
      },
      idempotencyKey: "welcome:client-100",
    });
    // Idempotencia: segunda llamada con misma clave devuelve exactamente la misma entrega
    const enqDuplicate = ntf.enqueueEmail({
      eventKey: "tenant.welcome",
      recipient: "Owner@NuevoComercio.co",
      locale: "es",
      variables: {
        tenant_name: "Nuevo Comercio",
        owner_name: "Carlos",
        login_url: "https://admin.mocter.co/es",
        brand_name: "Mocter",
      },
      idempotencyKey: "welcome:client-100",
    });

    expect(enq1.ok && enqDuplicate.ok).toBe(true);
    if (!enq1.ok || !enqDuplicate.ok) return;
    expect(enq1.data.id).toBe(enqDuplicate.data.id);
    expect(enq1.data.templateVersion).toBe(2);
    expect(enq1.data.status).toBe("queued");

    // Relay con RabbitMQ caído: no falla, conserva en 'queued'
    const relayDown = ntf.runOutboxRelayTick(false);
    expect(relayDown.publishedCount).toBe(0);
    expect(relayDown.remainingQueuedCount).toBe(1);

    // Relay cuando RabbitMQ se recupera: publica en RabbitMQ
    const relayUp = ntf.runOutboxRelayTick(true);
    expect(relayUp.publishedCount).toBe(1);

    // CA-NTF-06: 3 fallos de SMTP aplican backoff 1/5/15 min y al 3er fallo pasa a DLQ ('dead')
    const fail1 = ntf.processWorkerDeliveryAttempt(enq1.data.id, false, "SMTP 421");
    expect(fail1.ok && fail1.data.nextRetryDelayMinutes).toBe(1);
    const fail2 = ntf.processWorkerDeliveryAttempt(enq1.data.id, false, "SMTP 421");
    expect(fail2.ok && fail2.data.nextRetryDelayMinutes).toBe(5);
    const fail3 = ntf.processWorkerDeliveryAttempt(enq1.data.id, false, "SMTP 550");
    expect(fail3.ok && fail3.data.status).toBe("dead");
  });

  it("ADM-001 T-37: mocter_landing solo inserta leads; platform_sales/platform_admin gestionan estado, asignación, notas y exportan CSV con auditoría; tenant_* recibe 403", () => {
    const svc = new TransactionalNotificationsAndLeadsService();
    const lead = svc.insertPublicLandingLead({
      name: "María López",
      email: "maria@empresa.co",
      phone: "+573001112233",
      message: "Quiero demo para 5 agentes",
    });

    expect(lead.status).toBe("new");

    // tenant_owner recibe 403
    const tenantAttempt = svc.updateLandingLeadInAdmin({
      leadId: lead.id,
      actorUserId: "tenant-u1",
      actorRole: "tenant_owner",
      status: "contacted",
    });
    expect(tenantAttempt.ok).toBe(false);
    if (!tenantAttempt.ok) {
      expect(tenantAttempt.code).toBe("FORBIDDEN_LEADS_ACCESS");
    }

    // platform_sales actualiza estado, asigna y agrega nota quedando auditado
    const salesUpdate = svc.updateLandingLeadInAdmin({
      leadId: lead.id,
      actorUserId: "sales-u1",
      actorRole: "platform_sales",
      status: "qualified",
      assignedToUserId: "sales-u1",
      notes: "Cliente listo para plan Growth",
    });
    expect(salesUpdate.ok).toBe(true);
    expect(svc.getAuditLogEntries()).toHaveLength(1);

    const csv = svc.exportLandingLeadsToCsv({
      actorRole: "platform_sales",
      statusFilter: "qualified",
    });
    expect(csv.ok).toBe(true);
    if (csv.ok) {
      expect(csv.data).toContain("maria@empresa.co");
      expect(csv.data).toContain("qualified");
    }

    expect(sanitizeEmailHtml('<img src="javascript:alert(1)" onerror="hack()">')).not.toContain(
      "onerror",
    );
  });
});

