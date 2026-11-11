import { FloatingBackground } from "@/components/sections/floating-background";
import { Nav } from "@/components/nav";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Sectors } from "@/components/sections/sectors";
import { HowItWorks } from "@/components/sections/how-it-works";
import { LiveDemo } from "@/components/sections/live-demo";
import { PricingSection } from "@/components/sections/pricing-section";
import { Testimonial } from "@/components/sections/testimonial";
import { CtaSection } from "@/components/sections/cta-section";
import { Faq } from "@/components/sections/faq";
import { Footer } from "@/components/sections/footer";
import { WhatsappFab } from "@/components/sections/whatsapp-fab";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { getPublicPlans, type PublicPlanDto } from "@mocter/domain";
import { redirect } from "next/navigation";

export const instant = false;

interface LandingPageProps {
  params?: Promise<{ locale?: string }>;
}

export default async function LandingPage({ params }: LandingPageProps) {
  if (process.env.CELL_CODE) {
    const resolvedParams = params ? await params : undefined;
    const locale = resolvedParams?.locale === "en" ? "en" : "es";
    redirect(`/${locale}/login`);
  }

  let publicPlans: PublicPlanDto[] = [];
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
      <PricingSection plans={publicPlans} />
      <Testimonial />
      <CtaSection />
      <Faq />
      <Footer />
      <WhatsappFab />
      <ServiceWorkerRegistrar />
    </>
  );
}
