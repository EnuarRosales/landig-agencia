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
      ? "Política de Privacidad y Tratamiento de Datos Personales"
      : "Privacy Policy and Personal Data Processing",
    description: isEs
      ? "Política de tratamiento de datos personales de Mocter bajo la Ley 1581 de 2012 y normatividad colombiana. Conoce cómo protegemos y gestionamos tu información."
      : "Mocter privacy and personal data processing policy under Colombian Law 1581/2012. Learn how we safeguard and manage your data.",
    alternates: {
      canonical: `${SITE_URL}/${locale}/privacidad`,
      languages: {
        es: `${SITE_URL}/es/privacidad`,
        en: `${SITE_URL}/en/privacidad`,
        "x-default": `${SITE_URL}/es/privacidad`,
      },
    },
  };
}

export default async function PrivacidadPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isEs = locale === "es";

  const breadcrumbs = [
    { label: isEs ? "Inicio" : "Home", href: `/${locale}` },
    { label: isEs ? "Política de Privacidad" : "Privacy Policy" },
  ];

  return (
    <>
      <FloatingBackground />
      <Nav />

      <main className="relative z-10 mx-auto min-h-screen max-w-5xl px-[clamp(18px,5vw,40px)] pb-24 pt-32">
        <Breadcrumbs items={breadcrumbs} className="mb-8" />

        <header className="mb-12 border-b border-stroke pb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-semibold text-a2">
            <span>🛡️</span>
            <span>{isEs ? "Habeas Data · Ley 1581 de 2012 · Colombia" : "Habeas Data · Law 1581 of 2012 · Colombia"}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-txt sm:text-4xl">
            {isEs
              ? "Política de Tratamiento y Protección de Datos Personales"
              : "Personal Data Protection and Processing Policy"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            {isEs
              ? "En Mocter nos comprometemos con la privacidad, confidencialidad y custodia responsable de los datos personales de nuestros clientes, usuarios y prospectos, en estricto cumplimiento del marco legal colombiano y los más altos estándares internacionales de ciberseguridad."
              : "At Mocter, we are committed to the privacy, confidentiality, and responsible custody of our clients', users', and prospects' personal data, strictly adhering to Colombian data protection laws and international cybersecurity standards."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted/80">
            <span>{isEs ? "Vigencia: Octubre 2026" : "Effective Date: October 2026"}</span>
            <span>•</span>
            <span>{isEs ? "Responsable: Mocter" : "Responsible Entity: Mocter"}</span>
            <span>•</span>
            <a href="mailto:privacidad@mocter.co" className="text-a2 underline hover:opacity-80">
              privacidad@mocter.co
            </a>
          </div>
        </header>

        {/* Quick Nav / Table of Contents */}
        <section className="mb-12 rounded-2xl border border-stroke bg-surface/70 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-txt">
            {isEs ? "Tabla de Contenido" : "Table of Contents"}
          </h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              { id: "responsable", num: "1", title: isEs ? "Identificación del Responsable" : "Entity Identification" },
              { id: "marco-legal", num: "2", title: isEs ? "Marco Legal y Aplicabilidad" : "Legal Framework" },
              { id: "definiciones", num: "3", title: isEs ? "Definiciones Clave" : "Key Definitions" },
              { id: "principios", num: "4", title: isEs ? "Principios del Tratamiento" : "Guiding Principles" },
              { id: "datos-recolectados", num: "5", title: isEs ? "Datos Recolectados y Canales" : "Collected Data & Channels" },
              { id: "finalidades", num: "6", title: isEs ? "Finalidades del Tratamiento" : "Processing Purposes" },
              { id: "datos-sensibles", num: "7", title: isEs ? "Datos Sensibles y de Menores" : "Sensitive Data & Minors" },
              { id: "ia-transferencia", num: "8", title: isEs ? "IA y Transferencia Internacional" : "AI & International Transfers" },
              { id: "derechos-arco", num: "9", title: isEs ? "Derechos de los Titulares (ARCO)" : "Data Subject Rights" },
              { id: "procedimiento", num: "10", title: isEs ? "Procedimiento de Consultas y Reclamos" : "Inquiries & Claims Procedure" },
              { id: "seguridad", num: "11", title: isEs ? "Seguridad de la Información" : "Information Security" },
              { id: "cookies", num: "12", title: isEs ? "Cookies y Rastreo" : "Cookies & Tracking" },
              { id: "vigencia", num: "13", title: isEs ? "Vigencia y Modificaciones" : "Validity & Updates" },
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
          {/* 1. Responsable */}
          <section id="responsable" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">1. Identificación del Responsable del Tratamiento</h2>
            <div className="rounded-xl border border-stroke/70 bg-surface p-5">
              <ul className="space-y-2">
                <li><strong className="text-txt">Nombre comercial:</strong> Mocter</li>
                <li><strong className="text-txt">Jurisdicción:</strong> República de Colombia</li>
                <li><strong className="text-txt">Correo electrónico oficial para Habeas Data:</strong> <a href="mailto:privacidad@mocter.co" className="text-a2 underline">privacidad@mocter.co</a></li>
                <li><strong className="text-txt">Sitio web oficial:</strong> <a href="https://mocter.co" className="text-a2 underline">https://mocter.co</a></li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                {isEs
                  ? "Mocter actúa en calidad de Responsable del Tratamiento respecto de los datos personales obtenidos a través de este portal y sus canales propios de contacto, y como Encargado del Tratamiento cuando procesa datos por cuenta de sus clientes empresariales."
                  : "Mocter acts as Data Controller for personal data gathered via this portal, and as Data Processor when processing conversations on behalf of corporate clients."}
              </p>
            </div>
          </section>

          {/* 2. Marco Legal */}
          <section id="marco-legal" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">2. Marco Legal y Ámbito de Aplicación</h2>
            <p>
              {isEs
                ? "La presente política se rige por la Constitución Política de Colombia (Artículo 15), la Ley Estatutaria 1581 de 2012, el Decreto Reglamentario 1377 de 2013, el Decreto Único Reglamentario 1074 de 2015 del Sector Comercio, Industria y Turismo, y las instrucciones emanadas de la Superintendencia de Industria y Comercio (SIC). Asimismo, adopta estándares internacionales reconocidos de protección de datos (como el RGPD europeo) respecto a protocolos de transferencia internacional y consentimiento explícito."
                : "This policy is governed by the Colombian Political Constitution (Art. 15), Statutory Law 1581/2012, Regulatory Decree 1377/2013, and guidelines from the Superintendence of Industry and Commerce (SIC)."}
            </p>
          </section>

          {/* 3. Definiciones */}
          <section id="definiciones" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">3. Definiciones Clave</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-stroke/60 bg-bg2/40 p-4">
                <strong className="text-txt">Autorización:</strong> Consentimiento previo, expreso e informado del Titular para llevar a cabo el Tratamiento de datos personales.
              </div>
              <div className="rounded-lg border border-stroke/60 bg-bg2/40 p-4">
                <strong className="text-txt">Base de Datos:</strong> Conjunto organizado de datos personales objeto de Tratamiento.
              </div>
              <div className="rounded-lg border border-stroke/60 bg-bg2/40 p-4">
                <strong className="text-txt">Dato Personal:</strong> Cualquier información vinculada o que pueda asociarse a una o varias personas naturales determinadas o determinables.
              </div>
              <div className="rounded-lg border border-stroke/60 bg-bg2/40 p-4">
                <strong className="text-txt">Titular:</strong> Persona natural cuyos datos personales sean objeto de Tratamiento.
              </div>
            </div>
          </section>

          {/* 4. Principios */}
          <section id="principios" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">4. Principios Rectores del Tratamiento de Datos</h2>
            <p className="mb-3">
              {isEs
                ? "En el desarrollo, implementación y operación de nuestros servicios, aplicamos de manera armónica e integral los principios legales obligatorios:"
                : "Mocter strictly adheres to fundamental data processing principles:"}
            </p>
            <ul className="list-inside list-disc space-y-1.5 pl-2">
              <li><strong className="text-txt">Principio de Legalidad:</strong> Sujeción estricta a la ley y las disposiciones regulatorias.</li>
              <li><strong className="text-txt">Principio de Finalidad:</strong> El tratamiento obedece a una finalidad legítima y debidamente informada.</li>
              <li><strong className="text-txt">Principio de Libertad:</strong> El tratamiento solo se ejerce con el consentimiento libre y voluntario del Titular.</li>
              <li><strong className="text-txt">Principio de Veracidad o Calidad:</strong> La información debe ser veraz, completa, exacta, actualizada y comprobable.</li>
              <li><strong className="text-txt">Principio de Transparencia:</strong> Garantía de obtener en cualquier momento información sobre los datos personales en custodia.</li>
              <li><strong className="text-txt">Principio de Seguridad y Confidencialidad:</strong> Medidas técnicas y humanas para impedir adulteración, pérdida, consulta o uso no autorizado.</li>
            </ul>
          </section>

          {/* 5. Datos Recolectados */}
          <section id="datos-recolectados" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">5. Datos Personales Recolectados y Canales de Captura</h2>
            <p className="mb-3">
              {isEs
                ? "Mocter recolecta información de identificación y contacto necesaria para prestar sus servicios a través de:"
                : "Mocter collects identification and contact details required for service delivery via:"}
            </p>
            <div className="space-y-2">
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Formularios web oficiales</h3>
                <p className="text-xs">Nombre completo, correo electrónico corporativo o personal, número telefónico (WhatsApp) y detalles de la solicitud de demostración o cotización.</p>
              </div>
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Interacciones mediante WhatsApp Cloud API</h3>
                <p className="text-xs">Número de teléfono emisor, nombre de perfil de WhatsApp, mensajes de texto y contenido multimedia intercambiado durante conversaciones automatizadas de atención y agendamiento.</p>
              </div>
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Sincronización con herramientas de calendario</h3>
                <p className="text-xs">Horarios disponibles, correos de invitados a reuniones y títulos de eventos para agendamiento automatizado en Google Calendar y Google Meet.</p>
              </div>
            </div>
          </section>

          {/* 6. Finalidades */}
          <section id="finalidades" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">6. Finalidades del Tratamiento</h2>
            <p className="mb-3">Los datos personales son recolectados y tratados para:</p>
            <ol className="list-inside list-decimal space-y-2 pl-2">
              <li>Configurar, operar y suministrar la plataforma de automatización con inteligencia artificial por WhatsApp.</li>
              <li>Gestionar reservas, cancelaciones y reagendamiento de citas en tiempo real con integración de Google Calendar y Meet.</li>
              <li>Enviar confirmaciones, recordatorios de citas y notificaciones transaccionales solicitadas por el usuario.</li>
              <li>Atender peticiones, quejas, reclamos y solicitudes de soporte técnico.</li>
              <li>Verificar identidad y prevenir fraude, suplantación o abusos de servicio.</li>
              <li>Cumplir con obligaciones contables, tributarias y contractuales legales en Colombia.</li>
            </ol>
          </section>

          {/* 7. Datos Sensibles */}
          <section id="datos-sensibles" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">7. Tratamiento de Datos Sensibles y de Menores de Edad</h2>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-txt">
              <p className="font-medium">
                {isEs
                  ? "Mocter NO solicita, condiciona ni almacena deliberadamente datos personales sensibles (origen racial, convicciones políticas o religiosas, datos biométricos, orientación sexual o datos de salud), ni datos pertenecientes a menores de 18 años."
                  : "Mocter does NOT solicit or process sensitive data or personal data from individuals under 18 years of age."}
              </p>
              <p className="mt-2 text-xs text-muted">
                {isEs
                  ? "Si por error o inadvertencia un usuario suministra este tipo de información, Mocter procederá a su eliminación inmediata y segura de sus sistemas."
                  : "Any inadvertently collected sensitive information is purged immediately upon discovery."}
              </p>
            </div>
          </section>

          {/* 8. IA y Transferencia */}
          <section id="ia-transferencia" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">8. Inteligencia Artificial, Subencargados y Transferencia Internacional</h2>
            <p className="mb-3">
              {isEs
                ? "Para la prestación de servicios de automatización de alta fidelidad, Mocter utiliza infraestructura tecnológica de primer nivel y modelos avanzados de lenguaje:"
                : "To deliver high-performance AI automation, Mocter relies on leading enterprise infrastructure:"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Meta Platforms Ireland Ltd.</h3>
                <p className="text-xs">Proveedor oficial de WhatsApp Business Cloud API para el enrutamiento seguro de mensajes y webhooks cifrados.</p>
              </div>
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Modelos LLM (OpenAI / Anthropic)</h3>
                <p className="text-xs">Utilizados para inferencia en tiempo real bajo acuerdos empresariales con garantía de cero entrenamiento con datos del usuario.</p>
              </div>
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Google Cloud & Workspace</h3>
                <p className="text-xs">Integración de calendarios Google Calendar y Google Meet para generación de enlaces seguros de reunión.</p>
              </div>
              <div className="rounded-lg border border-stroke/70 bg-surface p-4">
                <h3 className="font-semibold text-txt">Alojamiento y Base de Datos</h3>
                <p className="text-xs">Servidores seguros con aislamiento de datos, respaldos encriptados y cifrado de datos en reposo y en tránsito (TLS 1.3 / AES-256).</p>
              </div>
            </div>
          </section>

          {/* 9. Derechos ARCO */}
          <section id="derechos-arco" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">9. Derechos de los Titulares (Derechos ARCO)</h2>
            <p className="mb-3">
              De conformidad con el Artículo 8 de la Ley 1581 de 2012, el Titular de los datos personales tiene los siguientes derechos:
            </p>
            <ul className="list-inside list-disc space-y-1.5 pl-2">
              <li><strong className="text-txt">Conocer, actualizar y rectificar</strong> sus datos personales frente a Mocter o los Encargados del Tratamiento.</li>
              <li><strong className="text-txt">Solicitar prueba</strong> de la autorización otorgada, salvo cuando la ley la exceptúe expresamente.</li>
              <li><strong className="text-txt">Ser informado</strong> previa solicitud, respecto del uso dado a sus datos personales.</li>
              <li><strong className="text-txt">Presentar ante la Superintendencia de Industria y Comercio</strong> quejas por infracciones a la ley.</li>
              <li><strong className="text-txt">Revocar la autorización</strong> y/o solicitar la supresión del dato cuando no exista un deber legal o contractual de permanecer en la base de datos.</li>
              <li><strong className="text-txt">Acceder en forma gratuita</strong> a sus datos personales que hayan sido objeto de tratamiento.</li>
            </ul>
          </section>

          {/* 10. Procedimiento */}
          <section id="procedimiento" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">10. Procedimiento para Consultas y Reclamos</h2>
            <div className="rounded-xl border border-stroke/80 bg-surface p-6">
              <p className="mb-3">
                Para ejercer cualquiera de los derechos descritos, el titular o sus causahabientes pueden remitir una comunicación formal al correo oficial:
              </p>
              <div className="my-3 rounded-lg bg-bg2 p-3 font-mono text-xs text-a2">
                Asunto: Ejercicio de Derechos de Habeas Data - [Nombre del Titular] <br />
                Destinatario: privacidad@mocter.co
              </div>
              <p className="text-xs text-muted">
                <strong className="text-txt">Términos legales de respuesta (Ley 1581 de 2012):</strong>
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
                <li><strong className="text-txt">Consultas:</strong> Serán atendidas en un término máximo de diez (10) días hábiles contados a partir de la fecha de recibo.</li>
                <li><strong className="text-txt">Reclamos:</strong> Serán resueltos en un término máximo de quince (15) días hábiles. Si no fuere posible resolver dentro de este término, se informará al interesado los motivos y la nueva fecha de respuesta.</li>
              </ul>
            </div>
          </section>

          {/* 11. Seguridad */}
          <section id="seguridad" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">11. Seguridad de la Información</h2>
            <p>
              Mocter adopta medidas técnicas, organizacionales y administrativas idóneas para resguardar los datos contra acceso no autorizado, alteración, pérdida o robo. Entre estas medidas se incluye el cifrado integral TLS 1.3 para comunicaciones web y API, bases de datos PostgreSQL con control de acceso restrictivo y copias de respaldo continuas.
            </p>
          </section>

          {/* 12. Cookies */}
          <section id="cookies" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">12. Cookies y Tecnologías de Rastreo</h2>
            <p>
              Nuestro portal emplea cookies técnicas necesarias para recordar tus preferencias de idioma (<code className="rounded bg-surface px-1 py-0.5 text-xs text-a2">NEXT_LOCALE</code>) y tema de interfaz (<code className="rounded bg-surface px-1 py-0.5 text-xs text-a2">mocter-theme</code>), así como cookies de atención en vivo de Chatwoot. Puedes revisar y modificar tu consentimiento en cualquier momento desde nuestra página de{" "}
              <a href={`/${locale}/cookies`} className="font-semibold text-a2 underline hover:opacity-80">
                Configuración de Privacidad
              </a>.
            </p>
          </section>

          {/* 13. Vigencia */}
          <section id="vigencia" className="scroll-mt-28">
            <h2 className="mb-4 text-xl font-bold text-txt">13. Vigencia y Modificaciones de la Política</h2>
            <p>
              La presente política rige a partir de su publicación en el sitio web de Mocter. Cualquier cambio sustancial en sus términos será publicado oportunamente en este mismo enlace con indicación de la fecha de última actualización.
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
