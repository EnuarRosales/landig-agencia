import { describe, expect, it, vi, beforeEach } from "vitest";
import { OrdersService, type RegisterOrderInput } from "./orders.service";
import type {
  IOrdersRepository,
  OrderWithDetails,
} from "../repositories/orders.repository.interface";
import type { ICrmRepository } from "../repositories/crm.repository.interface";
import type {
  CellOrder,
  CellOrderItem,
  CellOrderEvent,
  CellOrderReturn,
} from "../db/schemas/tenant/orders";

describe("ORD-001 · OrdersService (Máquina de estados, registrar_pedido y fulfillment)", () => {
  let mockOrdersRepo: IOrdersRepository;
  let mockCrmRepo: ICrmRepository;
  let ordersService: OrdersService;

  const sampleOrder: CellOrder = {
    id: "0192e200-0000-7000-8000-000000000001",
    clientId: "0192e100-0000-7000-8000-000000000001",
    number: "ORD-202610-0001",
    prospectId: "0192e300-0000-7000-8000-000000000001",
    chatwootConversationId: 101,
    source: "bot",
    status: "registered",
    paymentMethod: "contraentrega",
    paymentStatus: "pending",
    shippingMethod: "home",
    carrierId: null,
    carrierName: null,
    trackingCode: null,
    customerName: "Carlos Pérez",
    customerPhone: "+573001234567",
    customerDocument: null,
    addressLine: "Carrera 7 # 12-34",
    city: "Bogotá",
    state: "Cundinamarca",
    postalCode: "110111",
    subtotalCents: 100000,
    shippingCents: 10000,
    discountCents: 5000,
    totalCents: 105000,
    currency: "COP",
    notes: "Entregar en portería",
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
    toStatus: "registered",
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

  describe("T-03 · Máquina de estados (Transiciones, cancelaciones y eventos inmutables)", () => {
    it("permite transiciones válidas del ciclo de vida (registered -> confirmed -> preparing)", async () => {
      const activeDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "registered" },
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
          fromStatus: "registered",
          toStatus: "confirmed",
          actor: "tenant_owner",
        }),
        undefined,
      );
    });

    it("rechaza transiciones inválidas sin dejar eventos (p. ej. registered -> delivered)", async () => {
      const activeDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "registered" },
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
        reason: "", // Motivo vacío
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CANCEL_REASON_REQUIRED");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("exige confirmación o devolución reembolsada para cancelar un pedido con payment_status = 'paid'", async () => {
      const paidOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "confirmed", paymentStatus: "paid" },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [], // Sin devoluciones reembolsadas
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(paidOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "cancelled",
        actor: "tenant_owner",
        reason: "Cliente solicita cancelación",
        confirmRefundIfPaid: false,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("REFUND_REQUIRED_FOR_PAID_CANCELLATION");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
    });

    it("permite cancelar un pedido pagado si se confirma el reembolso explícitamente", async () => {
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
        actor: "tenant_owner",
        reason: "Reembolso procesado en pasarela",
        confirmRefundIfPaid: true,
      });

      expect(res.ok).toBe(true);
      expect(mockOrdersRepo.updateOrderStatus).toHaveBeenCalled();
    });

    it("exige transportadora para pasar a estado 'shipped'", async () => {
      const preparingOrderDetails: OrderWithDetails = {
        order: { ...sampleOrder, status: "preparing", carrierName: null, carrierId: null },
        items: [sampleItem],
        events: [sampleEvent],
        returns: [],
      };
      vi.mocked(mockOrdersRepo.findOrderById).mockResolvedValueOnce(preparingOrderDetails);

      const res = await ordersService.transitionStatus({
        cellId: "cell-1",
        clientId: sampleOrder.clientId,
        orderId: sampleOrder.id,
        toStatus: "shipped",
        actor: "tenant_agent",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CARRIER_REQUIRED_FOR_SHIPPED");
      }
      expect(mockOrdersRepo.updateOrderStatus).not.toHaveBeenCalled();
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
