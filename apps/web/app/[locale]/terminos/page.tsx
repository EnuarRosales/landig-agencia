import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { FloatingBackground } from "@/components/sections/floating-background";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/sections/footer";
import { WhatsappFab } from "@/components/sections/whatsapp-fab";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { Breadcrumbs } from "@/components/breadcrumbs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mocter.co";

type Props = PageProps<"/[locale]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === "es";

  return {
    title: isEs
      ? "Términos y Condiciones de Uso del Servicio"
      : "Terms and Conditions of Service",
    description: isEs
      ? "Términos y condiciones de uso de la plataforma Mocter para automatización de WhatsApp, agendamiento y ventas con IA. Marco legal en Colombia."
      : "Terms and conditions of use for Mocter AI automation platform for WhatsApp, scheduling, and sales. Colombian legal framework.",
    alternates: {
      canonical: `${SITE_URL}/${locale}/terminos`,
      languages: {
        es: `${SITE_URL}/es/terminos`,
        en: `${SITE_URL}/en/terminos`,
        "x-default": `${SITE_URL}/es/terminos`,
      },
    },
  };
}

export default async function TerminosPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isEs = locale === "es";

  const breadcrumbs = [
    { label: isEs ? "Inicio" : "Home", href: `/${locale}` },
    { label: isEs ? "Términos y Condiciones" : "Terms & Conditions" },
  ];

  return (
    <>
      <FloatingBackground />
      <Nav />

      <main className="relative z-10 mx-auto min-h-screen max-w-5xl px-[clamp(18px,5vw,40px)] pb-24 pt-32">
        <Breadcrumbs items={breadcrumbs} className="mb-8" />

        <header className="mb-12 border-b border-stroke pb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-semibold text-a2">
            <span>⚖️</span>
            <span>{isEs ? "Contrato de Servicio · Ley 527 de 1999 · Colombia" : "Service Agreement · Law 527 of 1999 · Colombia"}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-txt sm:text-4xl">
            {isEs
              ? "Términos y Condiciones de Uso de Mocter"
              : "Mocter Terms and Conditions of Service"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            {isEs
              ? "El presente documento establece los términos y condiciones vinculantes que rigen el acceso y uso de la plataforma Mocter, sus agentes conversacionales de IA por WhatsApp, servicios de agendamiento y herramientas asociadas."
              : "This document outlines the legally binding terms and conditions governing access to and usage of the Mocter platform, its WhatsApp AI conversational agents, scheduling services, and associated tooling."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted/80">
            <span>{isEs ? "Última actualización: Octubre 2026" : "Last updated: October 2026"}</span>
            <span>•</span>
            <span>{isEs ? "Operador: Mocter" : "Operator: Mocter"}</span>
            <span>•</span>
            <a href="mailto:info@mocter.co" className="text-a2 underline hover:opacity-80">
              info@mocter.co
            </a>
          </div>
        </header>

        {/* Quick Nav / Table of Contents */}
        <section className="mb-12 rounded-2xl border border-stroke bg-surface/70 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-txt">
            {isEs ? "Estructura del Acuerdo" : "Agreement Structure"}
          </h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              { id: "aceptacion", num: "1", title: isEs ? "Aceptación del Acuerdo" : "Acceptance of Terms" },
              { id: "descripcion", num: "2", title: isEs ? "Descripción del Servicio" : "Service Description" },
              { id: "cuentas", num: "3", title: isEs ? "Cuentas y Registro" : "Accounts & Registration" },
              { id: "uso-aceptable", num: "4", title: isEs ? "Uso Aceptable y Restricciones" : "Acceptable Use & Restrictions" },
              { id: "integraciones", num: "5", title: isEs ? "Integraciones de Terceros (WhatsApp, Google)" : "Third-Party Integrations" },
              { id: "sla", num: "6", title: isEs ? "Disponibilidad y Nivel de Servicio (SLA)" : "Availability & SLA" },
              { id: "propiedad-intelectual", num: "7", title: isEs ? "Propiedad Intelectual" : "Intellectual Property" },
              { id: "precios-pagos", num: "8", title: isEs ? "Precios, Facturación y Pagos" : "Pricing & Billing" },
              { id: "cancelacion", num: "9", title: isEs ? "Terminación y Cancelación" : "Termination & Cancellation" },
              { id: "responsabilidad", num: "10", title: isEs ? "Limitación de Responsabilidad" : "Limitation of Liability" },
              { id: "confidencialidad", num: "11", title: isEs ? "Habeas Data y Privacidad" : "Data Protection & Privacy" },
              { id: "jurisdiccion", num: "12", title: isEs ? "Ley Aplicable y Jurisdicción" : "Governing Law & Jurisdiction" },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-2 rounded-lg p-2 text-muted transition hover:bg-bg2 hover:text-a2"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stroke/60 font-mono text-[11px] font-bold text-txt">
                  {item.num}
                </span>
                <span className="truncate">{item.title}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Content Sections */}
        <div className="space-y-12 text-sm leading-relaxed text-muted sm:text-[15px]">
          {/* 1. Aceptación */}
          <section id="aceptacion" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">1. Aceptación de los Términos</h2>
            <p>
              Al registrarse, acceder o utilizar el sitio web <code className="rounded bg-surface px-1 py-0.5 text-xs text-a2">https://mocter.co</code>, solicitar una demostración o contratar los servicios de automatización con IA de Mocter, usted (el "Cliente" o "Usuario") manifiesta que ha leído, comprendido y aceptado en su totalidad estos Términos y Condiciones, así como nuestra{" "}
              <a href={`/${locale}/privacidad`} className="text-a2 underline">
                Política de Privacidad
              </a>. Si no está de acuerdo con alguna disposición, deberá abstenerse de usar nuestros servicios.
            </p>
          </section>

          {/* 2. Descripción */}
          <section id="descripcion" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">2. Descripción del Servicio</h2>
            <p className="mb-3">
              Mocter es una plataforma de software como servicio (SaaS) especializada en la automatización de atención al cliente, agendamiento de citas y gestión de ventas mediante agentes de inteligencia artificial conectados al canal oficial de WhatsApp del Cliente:
            </p>
            <ul className="list-inside list-disc space-y-1.5 pl-2">
              <li><strong className="text-txt">Atención 24/7 con IA:</strong> Procesamiento de lenguaje natural en español adaptado al tono y catálogo del negocio.</li>
              <li><strong className="text-txt">Agendamiento Inteligente:</strong> Consulta de disponibilidad y creación de eventos en Google Calendar y Google Meet en tiempo real.</li>
              <li><strong className="text-txt">Gestión de Pedidos y Cotizaciones:</strong> Captura y estructuración de requerimientos comerciales.</li>
              <li><strong className="text-txt">Bandeja Unificada e Intervención Humana:</strong> Capacidad para que operadores humanos tomen el control de cualquier conversación cuando sea requerido.</li>
            </ul>
          </section>

          {/* 3. Cuentas */}
          <section id="cuentas" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">3. Cuentas y Registro</h2>
            <p>
              Para acceder a los servicios operativos de Mocter, el Cliente debe proporcionar información veraz, precisa y actualizada. El Cliente es el único responsable de salvaguardar las credenciales de acceso asignadas y de todas las actividades que se realicen bajo su cuenta. Mocter no responderá por pérdidas derivadas del uso indebido de credenciales atribuibles al Cliente.
            </p>
          </section>

          {/* 4. Uso Aceptable */}
          <section id="uso-aceptable" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">4. Uso Aceptable y Restricciones</h2>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-txt">
              <h3 className="mb-2 font-bold text-rose-600 dark:text-rose-400">Conductas Estrictamente Prohibidas:</h3>
              <ul className="list-inside list-disc space-y-1 text-xs text-muted">
                <li>Utilizar la plataforma para envío masivo no autorizado de publicidad (Spam) o mensajes no consentidos.</li>
                <li>Transmitir contenido difamatorio, fraudulento, engañoso, sexualmente explícito, que incite a la violencia o viole derechos de propiedad intelectual.</li>
                <li>Infringir las directrices oficiales de Meta WhatsApp Business Policy o los términos de servicio de Google.</li>
                <li>Intentar descompilar, realizar ingeniería inversa o vulnerar los mecanismos de seguridad de la plataforma Mocter.</li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                El incumplimiento facultará a Mocter a suspender o terminar de manera inmediata y sin previo aviso la prestación del servicio.
              </p>
            </div>
          </section>

          {/* 5. Integraciones */}
          <section id="integraciones" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">5. Integraciones de Terceros (WhatsApp Cloud API y Google)</h2>
            <p>
              El funcionamiento del servicio depende de la interoperabilidad con plataformas de terceros como Meta Platforms (WhatsApp Business Cloud API) y Google LLC (Google Workspace, Calendar y Meet). El Cliente reconoce que la disponibilidad y políticas de uso de dichas plataformas están fuera del control exclusivo de Mocter, y se compromete a mantener sus cuentas de terceros en regla para la debida ejecución de las integraciones.
            </p>
          </section>

          {/* 6. SLA */}
          <section id="sla" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">6. Disponibilidad y Nivel de Servicio (SLA)</h2>
            <p>
              Mocter despliega sus servicios sobre infraestructura moderna de alta disponibilidad con un objetivo de disponibilidad del 99.5% mensual, excluyendo mantenimientos programados informados previamente y eventos de fuerza mayor o fallas generales de conectividad en redes de telecomunicaciones.
            </p>
          </section>

          {/* 7. Propiedad Intelectual */}
          <section id="propiedad-intelectual" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">7. Propiedad Intelectual</h2>
            <p>
              Todos los componentes del software, algoritmos, diseños, marcas comerciales, código fuente, flujos conversacionales estándar y contenidos creados por Mocter son de su propiedad exclusiva. El Cliente conserva la propiedad absoluta de sus datos comerciales, marcas y listas de contactos. Mocter no adquiere derecho alguno sobre la información de negocio suministrada por el Cliente distinta a la licencia indispensable para operar el servicio contratado.
            </p>
          </section>

          {/* 8. Precios y Facturación */}
          <section id="precios-pagos" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">8. Precios, Facturación y Pagos</h2>
            <p>
              Las tarifas por suscripción y servicios de implementación se estipulan en la propuesta comercial o contrato suscrito con cada Cliente. Los precios se expresan en pesos colombianos (COP) o dólares estadounidenses (USD) según aplique, con expedición de factura electrónica conforme a la normatividad tributaria de Colombia (DIAN). Los pagos se realizan de forma anticipada según la periodicidad contratada.
            </p>
          </section>

          {/* 9. Cancelación */}
          <section id="cancelacion" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">9. Cancelación y Terminación</h2>
            <p>
              Cualquiera de las partes podrá dar por terminado el servicio mediante notificación escrita remitida con al menos treinta (30) días de antelación al vencimiento del periodo de suscripción vigente. A la terminación, Mocter pondrá a disposición del Cliente la exportación de sus datos históricos y procederá con su posterior borrado seguro.
            </p>
          </section>

          {/* 10. Responsabilidad */}
          <section id="responsabilidad" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">10. Limitación de Responsabilidad</h2>
            <p>
              En la máxima medida permitida por la ley aplicable, Mocter no será responsable por daños indirectos, lucro cesante o pérdidas derivadas de la interrupción en servicios de terceros (Meta o Google). La responsabilidad total agregada de Mocter frente al Cliente estará limitada a las sumas efectivamente pagadas por este durante los tres (3) meses anteriores al hecho causante del reclamo.
            </p>
          </section>

          {/* 11. Confidencialidad */}
          <section id="confidencialidad" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">11. Protección de Datos y Confidencialidad</h2>
            <p>
              Las partes se comprometen a guardar estricta reserva sobre toda información confidencial intercambiada. El tratamiento de datos personales se sujetará invariablemente a lo dispuesto en la Ley 1581 de 2012 de Colombia y a nuestra{" "}
              <a href={`/${locale}/privacidad`} className="text-a2 underline">
                Política de Privacidad
              </a>.
            </p>
          </section>

          {/* 12. Jurisdicción */}
          <section id="jurisdiccion" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">12. Ley Aplicable y Jurisdicción</h2>
            <p>
              Estos Términos y Condiciones se rigen e interpretan con arreglo a las leyes de la República de Colombia. Cualquier controversia que no pueda ser resuelta de común acuerdo entre las partes será sometida a los jueces competentes de la República de Colombia.
            </p>
          </section>
        </div>
      </main>

      <Footer />
      <WhatsappFab />
      <ServiceWorkerRegistrar />
    </>
  );
}
