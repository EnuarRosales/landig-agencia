import { setRequestLocale } from "next-intl/server";
import { FloatingBackground } from "@/components/sections/floating-background";
import { Nav } from "@/components/nav";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Sectors } from "@/components/sections/sectors";
import { HowItWorks } from "@/components/sections/how-it-works";
import { LiveDemo } from "@/components/sections/live-demo";
import { Testimonial } from "@/components/sections/testimonial";
import { CtaSection } from "@/components/sections/cta-section";
import { Faq } from "@/components/sections/faq";
import { Footer } from "@/components/sections/footer";
import { WhatsappFab } from "@/components/sections/whatsapp-fab";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

export default async function LandingPage(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <>
      <FloatingBackground />
      <Nav />
      <Hero />
      <Features />
      <Sectors />
      <HowItWorks />
      <LiveDemo />
      <Testimonial />
      <CtaSection />
      <Faq />
      <Footer />
      <WhatsappFab />
      <ServiceWorkerRegistrar />
    </>
  );
}
