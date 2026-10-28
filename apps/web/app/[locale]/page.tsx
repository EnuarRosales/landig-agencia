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
import { getPublicPlans, type Plan } from "@mocter/domain";

export default async function LandingPage() {
  let publicPlans: Plan[] = [];
  try {
    publicPlans = await getPublicPlans();
  } catch {
    // Si la base no está lista o no hay conexión, degrada a arreglo vacío
    publicPlans = [];
  }

  const hasPublicPlans = publicPlans.length > 0;

  return (
    <>
      <FloatingBackground />
      <Nav hasPublicPlans={hasPublicPlans} />
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
