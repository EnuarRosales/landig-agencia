import { describe, expect, it, vi, beforeEach } from "vitest";
import { OrdersService, type RegisterOrderInput } from "./orders.service";
import { OrderGuideRendererService } from "./order-guide-renderer.service";
import {
  OrderRepositoryDomainError,
  type IOrdersRepository,
  type OrderWithDetails,
} from "../repositories/orders.repository.interface";
import type { ICrmRepository } from "../repositories/crm.repository.interface";
import type {
  CellOrder,
  CellOrderItem,
  CellOrderEvent,
} from "../db/schemas/tenant/orders";

describe("ORD-001 & SPEC-11 · OrdersService (12 estados Dropi/Effi, inventario, repetir pedido y guías)", () => {
  let mockOrdersRepo: IOrdersRepository;
  let mockCrmRepo: ICrmRepository;
  let ordersService: OrdersService;

  const sampleOrder: CellOrder = {
    id: "0192e200-0000-7000-8000-000000000001",
    clientId: "0192e100-0000-7000-8000-000000000001",
    number: "ORD-202610-0001",
    prospectId: "0192e300-0000-7000-8000-000000000001",
    contactAddressId: null,
    chatwootConversationId: 101,
    source: "bot",
    status: "pending_confirmation",
    paymentMethod: "contraentrega",
    paymentChannelId: null,
    paymentStatus: "pending",
    shippingMethod: "home",
    carrierId: null,
    carrierName: null,
    trackingCode: null,
    customerName: "Carlos Pérez",
    customerPhone: "+573001234567",
    customerDocument: null,
    countryCode: "CO",
    subdivisionCode: "CO-DC",
    addressLine: "Carrera 7 # 12-34",
    addressComplement: null,
    neighborhood: null,
    city: "Bogotá",
    state: "Cundinamarca",
    postalCode: "110111",
    referenceNotes: null,
    geoResolutionStatus: "iso_resolved",
    rawLocationInput: null,
    providerGeoRefs: {},
    subtotalCents: 100000,
    shippingCents: 10000,
    discountCents: 5000,
    totalCents: 105000,
    currency: "COP",
    notes: "Entregar en portería",
    stockDeducted: false,
    guideGeneratedAt: null,
    cancellationReason: null,
    issueNotes: null,
    repeatedFromOrderId: null,
    externalErpSystem: null,
    externalErpReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "bot",
    updatedBy: "bot",
  };

  const sampleItem: CellOrderItem = {
    id: "0192e400-0000-7000-8000-000000000001",
    clientId: "0192e100-0000-7000-8000-000000000001",
    orderId: sampleOrder.id,
    productId: "0192e500-0000-7000-8000-000000000001",
    productName: "Serum Facial Antiedad",
    productSku: "SKU-SERUM-01",
    quantity: 2,
    unitPriceCents: 50000,
    unitCostCents: 20000,
    selectedAttributes: { Presentación: "30ml" },
    tierMinQty: 2,
    lineTotalCents: 100000,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "bot",
    updatedBy: "bot",
  };

  const sampleEvent: CellOrderEvent = {
    id: "0192e600-0000-7000-8000-000000000001",
    clientId: "0192e100-0000-7000-8000-000000000001",
    orderId: sampleOrder.id,
    fromStatus: null,
    toStatus: "pending_confirmation",
    actor: "bot",
    reason: "Registro inicial de pedido",
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockOrdersRepo = {
      getNextOrderNumber: vi.fn().mockResolvedValue("ORD-202610-0001"),
      findActiveOrderByChatwootConversationId: vi.fn().mockResolvedValue(null),
      findOrderById: vi.fn().mockResolvedValue(null),
      findOrderByNumber: vi.fn().mockResolvedValue(null),
      createOrder: vi.fn().mockResolvedValue({
        order: sampleOrder,
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      }),
      updateOrderStatus: vi.fn().mockResolvedValue({
        order: { ...sampleOrder, status: "confirmed" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      }),
      updateOrderPaymentStatus: vi.fn().mockResolvedValue({
        ...sampleOrder,
        paymentStatus: "paid",
      }),
      createOrderReturn: vi.fn().mockResolvedValue({
        id: "0192e700-0000-7000-8000-000000000001",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        reason: "Producto averiado",
        amountCents: 50000,
        status: "requested",
        actor: "tenant_agent",
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "tenant_agent",
        updatedBy: "tenant_agent",
      }),
      listShippingCarriers: vi.fn().mockResolvedValue([]),
      createShippingCarrier: vi.fn().mockResolvedValue({
        id: "0192e800-0000-7000-8000-000000000001",
        clientId: sampleOrder.clientId,
        name: "Servientrega",
        trackingUrlTemplate: "https://servientrega.com/{tracking_code}",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system",
      }),
      listOrders: vi.fn().mockResolvedValue({ items: [sampleOrder], total: 1 }),
      getOrderMetrics: vi.fn().mockResolvedValue({
        totalOrders: 10,
        totalSalesCents: 1000000,
        averageTicketCents: 100000,
        deliveredOrders: 7,
        cancelledOrders: 1,
        returnedOrders: 1,
        totalReturnsCents: 50000,
      }),
    };

    mockCrmRepo = {
      createContact: vi.fn(),
      updateContact: vi.fn().mockResolvedValue(null),
      findContactById: vi.fn(),
      findContactByChatwootId: vi.fn(),
      findContactsByPhone: vi.fn(),
      listContacts: vi.fn(),
      anonymizeContact: vi.fn(),
      createConsent: vi.fn(),
      findActiveConsent: vi.fn(),
      revokeConsent: vi.fn(),
      listConsentsByProspect: vi.fn(),
      createPrivacyNotice: vi.fn(),
      findPublishedPrivacyNotice: vi.fn(),
      upsertContactProfile: vi.fn(),
      appendContactEpisode: vi.fn(),
      getQualityMetrics: vi.fn(),
    };

    ordersService = new OrdersService(mockOrdersRepo, mockCrmRepo);
  });

  describe("T-04 & T-05 · registrar_pedido (Idempotencia, snapshot y totales)", () => {
    const defaultInput: RegisterOrderInput = {
      cellId: "cell-1",
      clientId: sampleOrder.clientId,
      chatwootConversationId: 101,
      prospectId: sampleOrder.prospectId!,
      source: "bot",
      paymentMethod: "contraentrega",
      customer: {
        name: "Carlos Pérez",
        phone: "+573001234567",
      },
      shipping: {
        method: "home",
        addressLine: "Carrera 7 # 12-34",
        city: "Bogotá",
        shippingCents: 10000,
      },
      items: [
        {
          productId: sampleItem.productId!,
          productName: "Serum Facial Antiedad",
          productSku: "SKU-SERUM-01",
          quantity: 2,
          unitPriceCents: 50000,
          tierMinQty: 2,
        },
      ],
      discountCents: 5000,
      currency: "COP",
      notes: "Entregar en portería",
    };

    it("es estrictamente idempotente: una conversación activa devuelve el pedido existente sin duplicar", async () => {
      const existingDetails: OrderWithDetails = {
        order: sampleOrder,
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };

      vi.mocked(mockOrdersRepo.findActiveOrderByChatwootConversationId).mockResolvedValueOnce(
        existingDetails,
      );

      const res = await ordersService.registerOrder(defaultInput);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.order.id).toBe(sampleOrder.id);
      }
      expect(mockOrdersRepo.createOrder).not.toHaveBeenCalled();
      expect(mockOrdersRepo.getNextOrderNumber).not.toHaveBeenCalled();
    });

    it("calcula totales en centavos (subtotal + envío - descuento = total) y genera número atómico", async () => {
      const res = await ordersService.registerOrder(defaultInput);

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.getNextOrderNumber).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        expect.stringMatching(/^\d{6}$/),
      );
      expect(mockOrdersRepo.createOrder).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        expect.objectContaining({
          order: expect.objectContaining({
            number: "ORD-202610-0001",
            subtotalCents: 100000,
            shippingCents: 10000,
            discountCents: 5000,
            totalCents: 105000,
            currency: "COP",
          }),
        }),
      );
    });

    it("rechaza el pedido si el descuento supera el subtotal + envío produciendo total negativo", async () => {
      const invalidInput: RegisterOrderInput = {
        ...defaultInput,
        discountCents: 200000, // Mayor que 100000 + 10000
      };

      const res = await ordersService.registerOrder(invalidInput);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORDER_TOTAL_NEGATIVE");
      }
      expect(mockOrdersRepo.createOrder).not.toHaveBeenCalled();
    });

    it("exige documento de identidad obligatorio si el método de envío es 'office' (reclamo en agencia)", async () => {
      const officeInputWithoutDoc: RegisterOrderInput = {
        ...defaultInput,
        shipping: {
          method: "office",
          city: "Medellín",
        },
        customer: {
          name: "Laura Gómez",
          phone: "+573109876543",
          document: "",
        },
      };

      const res = await ordersService.registerOrder(officeInputWithoutDoc);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORDER_OFFICE_DOCUMENT_REQUIRED");
      }
      expect(mockOrdersRepo.createOrder).not.toHaveBeenCalled();
    });

    it("avanza el prospecto en CRM-001 a etapa 'customer' en el registro exitoso (T-09)", async () => {
      const res = await ordersService.registerOrder(defaultInput);

      expect(res.ok).toBe(true);
      expect(mockCrmRepo.updateContact).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.prospectId,
        expect.objectContaining({
          stage: "customer",
        }),
      );
    });
  });

  describe("T-03 · Máquina de 12 estados (Transiciones, cancelaciones, inventario y eventos inmutables)", () => {
    it("permite transiciones válidas del ciclo de vida (pending_confirmation -> confirmed) solicitando descuento de stock", async () => {
      const activeDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "pending_confirmation", stockDeducted: false },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(activeDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "confirmed",
        actor: "tenant_owner",
        reason: "Confirmado telefónicamente",
      });

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.updateOrderStatus).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "confirmed",
        expect.objectContaining({
          fromStatus: "pending_confirmation",
          toStatus: "confirmed",
          actor: "tenant_owner",
        }),
        expect.objectContaining({
          stockAction: "deduct",
        }),
      );
    });

    it("rechaza transiciones inválidas sin dejar eventos (p. ej. pending_confirmation -> delivered)", async () => {
      const activeDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "pending_confirmation" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(activeDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "delivered",
        actor: "tenant_agent",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_STATE_TRANSITION");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("exige motivo obligatorio para cancelar un pedido", async () => {
      const activeDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(activeDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "cancelled",
        actor: "tenant_agent",
        reason: "",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CANCEL_REASON_REQUIRED");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("bloquea a tenant_agent cancelar un pedido pagado (RN-SPEC-11-07)", async () => {
      const paidOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed", paymentStatus: "paid" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(paidOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "cancelled",
        actor: "agent@tienda.co",
        actorRole: "tenant_agent",
        reason: "Cliente solicita cancelación",
        confirmRefundIfPaid: true,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("FORBIDDEN_PAID_CANCELLATION");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("exige confirmación o devolución reembolsada para cancelar un pedido con payment_status = 'paid'", async () => {
      const paidOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed", paymentStatus: "paid" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(paidOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "cancelled",
        actor: "owner@tienda.co",
        actorRole: "tenant_owner",
        reason: "Cliente solicita cancelación",
        confirmRefundIfPaid: false,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("REFUND_REQUIRED_FOR_PAID_CANCELLATION");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("permite cancelar un pedido pagado si es propietario y restituye stock cuando stockDeducted=true", async () => {
      const paidOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed", paymentStatus: "paid", stockDeducted: true },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(paidOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "cancelled",
        actor: "owner@tienda.co",
        actorRole: "tenant_owner",
        reason: "Reembolso procesado en pasarela",
        confirmRefundIfPaid: true,
      });

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.updateOrderStatus).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "cancelled",
        expect.objectContaining({ toStatus: "cancelled" }),
        expect.objectContaining({
          stockAction: "restore",
          cancellationReason: "Reembolso procesado en pasarela",
        }),
      );
    });

    it("exige transportadora y número de guía para pasar a estado 'dispatched'", async () => {
      const preparingOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "guide_generated", carrierName: null, carrierId: null, trackingCode: null },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(preparingOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "dispatched",
        actor: "tenant_agent",
        carrierName: "Servientrega",
        trackingCode: "",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CARRIER_AND_TRACKING_REQUIRED_FOR_DISPATCH");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("no vuelve a descontar inventario si stockDeducted ya es true al avanzar hacia preparing/guide_generated", async () => {
      const confirmedDeducted: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed", stockDeducted: true },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(confirmedDeducted);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "preparing",
        actor: "tenant_agent",
      });

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.updateOrderStatus).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "preparing",
        expect.any(Object),
        undefined,
      );
    });

    it("propaga INSUFFICIENT_STOCK cuando el repositorio revierte por falta de inventario", async () => {
      const pendingOrder: OrderWithDetails = {
        order: { ...sampleOrder, status: "pending_confirmation", stockDeducted: false },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(pendingOrder);
      vi.mocked(mockOrdersRepo.updateOrderStatus).mockRejectedValueOnce(
        new OrderRepositoryDomainError("Stock insuficiente para Serum Facial Antiedad.", "INSUFFICIENT_STOCK"),
      );

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "confirmed",
        actor: "tenant_owner",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INSUFFICIENT_STOCK");
      }
    });
  });

  describe("SPEC-11 · Edición pre-despacho, Repetir Pedido y Renderizador de Guías", () => {
    it("bloquea la edición integral mediante updateOrderDetails cuando el pedido ya está en tránsito", async () => {
      mockOrdersRepo.updateOrderDetails = vi.fn();
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce({
        order: { ...sampleOrder, status: "in_transit" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      });

      const res = await ordersService.updateOrderDetails({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        actor: "tenant_owner",
        notes: "Intento tardío",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORDER_LOCKED_AFTER_DISPATCH");
      }
      expect(mockOrdersRepo.updateOrderDetails).not.toHaveBeenCalled();
    });

    it("repeatOrder clona ítems activos con precios vigentes y reporta inactivos en skippedItems", async () => {
      const inactiveItem: CellOrderItem = {
        ...sampleItem,
        id: "0192e400-0000-7000-8000-000000000002",
        productId: "0192e500-0000-7000-8000-000000000002",
        productName: "Producto Descontinuado",
        productSku: "SKU-OLD-02",
        quantity: 1,
        unitPriceCents: 30000,
        lineTotalCents: 30000,
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce({
        order: sampleOrder,
        items: [sampleItem, inactiveItem],
        events: [sampleEvent],
        returns: [],
      });
      mockOrdersRepo.getRepeatOrderCatalogContext = vi.fn().mockResolvedValueOnce({
        productsById: {
          [sampleItem.productId!]: {
            id: sampleItem.productId!,
            name: "Serum Facial Antiedad",
            sku: "SKU-SERUM-01",
            kind: "physical",
            compositionType: "simple",
            availability: "in_stock",
            status: "active",
            priceCents: 55000,
            salePriceCents: null,
            costPriceCents: 21000,
            stockQuantity: 10,
            attributes: [],
            comboEffectiveStock: null,
            hasInactiveComboComponent: false,
          },
          [inactiveItem.productId!]: {
            id: inactiveItem.productId!,
            name: "Producto Descontinuado",
            sku: "SKU-OLD-02",
            kind: "physical",
            compositionType: "simple",
            availability: "in_stock",
            status: "inactive",
            priceCents: 30000,
            salePriceCents: null,
            costPriceCents: 10000,
            stockQuantity: 0,
            attributes: [],
            comboEffectiveStock: null,
            hasInactiveComboComponent: false,
          },
        },
        defaultContactAddress: null,
        activePaymentChannel: null,
      });

      const res = await ordersService.repeatOrder({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        actor: "tenant_owner",
        confirmImmediately: false,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.mode).toBe("draft");
        expect(res.data.draft.items).toHaveLength(1);
        expect(res.data.draft.items[0]?.unitPriceCents).toBe(55000);
        expect(res.data.skippedItems).toHaveLength(1);
        expect(res.data.skippedItems[0]?.reason).toBe("PRODUCT_INACTIVE");
        expect(res.data.warnings.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("OrderGuideRendererService genera HTML print-ready con QR SVG y PDF binario válido (%PDF-1.4)", () => {
      const renderer = new OrderGuideRendererService();
      const orderDetails: OrderWithDetails = {
        order: {
          ...sampleOrder,
          status: "dispatched",
          carrierName: "Servientrega",
          trackingCode: "SRV-998811",
        },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      const merchant = {
        businessName: "Tienda Aurora",
        city: "Bogotá",
        phone: "+573001112233",
        locale: "es" as const,
      };

      const htmlGuide = renderer.render({ orderDetails, merchant, size: "10x15", format: "html" });
      expect(htmlGuide.contentType).toContain("text/html");
      expect(typeof htmlGuide.body).toBe("string");
      expect(String(htmlGuide.body)).toContain("SRV-998811");
      expect(String(htmlGuide.body)).toContain("VALOR A RECAUDAR");
      expect(String(htmlGuide.body)).toContain("<svg");

      const pdfGuide = renderer.render({ orderDetails, merchant, size: "letter", format: "pdf" });
      expect(pdfGuide.contentType).toBe("application/pdf");
      expect(Buffer.isBuffer(pdfGuide.body)).toBe(true);
      const pdfStr = (pdfGuide.body as Buffer).toString("latin1");
      expect(pdfStr.startsWith("%PDF-1.4")).toBe(true);
      expect(pdfStr).toContain("%%EOF");
      expect(pdfStr).toContain("SRV-998811");
    });
  });

  describe("T-07 & T-08 · Pagos y devoluciones", () => {
    it("actualiza el estado de pago del pedido", async () => {
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce({
        order: sampleOrder,
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      });

      const res = await ordersService.updatePaymentStatus(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "paid",
      );

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.updateOrderPaymentStatus).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "paid",
      );
    });

    it("registra una devolución de producto y si es recibida transiciona el pedido a 'returned'", async () => {
      const deliveredDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "delivered" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(deliveredDetails);

      const res = await ordersService.registerReturn({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        reason: "Talla incorrecta",
        amountCents: 50000,
        status: "received",
        actor: "tenant_agent",
      });

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.createOrderReturn).toHaveBeenCalled();
      expect(mockOrdersRepo.updateOrderStatus).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        sampleOrder.id,
        "returned",
        expect.objectContaining({
          fromStatus: "delivered",
          toStatus: "returned",
        }),
        undefined,
      );
    });
  });

  describe("T-10 · Métricas agregadas para REP-001", () => {
    it("calcula ventas, ticket promedio y devoluciones en caliente para un rango válido", async () => {
      const start = new Date("2026-10-01");
      const end = new Date("2026-10-31");

      const res = await ordersService.getOrderMetrics(
        "cell-1",
        sampleOrder.clientId,
        start,
        end,
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.totalOrders).toBe(10);
        expect(res.data.totalSalesCents).toBe(1000000);
        expect(res.data.averageTicketCents).toBe(100000);
        expect(res.data.totalReturnsCents).toBe(50000);
      }
      expect(mockOrdersRepo.getOrderMetrics).toHaveBeenCalledWith(
        "cell-1",
        sampleOrder.clientId,
        start,
        end,
      );
    });

    it("rechaza rangos temporales invertidos con error descriptivo", async () => {
      const start = new Date("2026-10-31");
      const end = new Date("2026-10-01");

      const res = await ordersService.getOrderMetrics(
        "cell-1",
        sampleOrder.clientId,
        start,
        end,
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("INVALID_DATE_RANGE");
      }
      expect(mockOrdersRepo.getOrderMetrics).not.toHaveBeenCalled();
    });
  });
});
