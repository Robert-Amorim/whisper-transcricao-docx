import CtaSection from "../components/landing/CtaSection";
import HeroSection from "../components/landing/HeroSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import MarketingFooter from "../components/landing/MarketingFooter";
import MarketingHeader from "../components/landing/MarketingHeader";
import PricingSection from "../components/landing/PricingSection";
import ProfessionalSection from "../components/landing/ProfessionalSection";

export default function HomePage() {
  return (
    <div className="lp-standard dark font-display antialiased selection:bg-primary selection:text-white">
      <div className="lp-standard-shell relative flex min-h-screen w-full flex-col overflow-x-hidden">
        <MarketingHeader />

        <main className="lp-standard-main flex flex-grow flex-col">
          <HeroSection />
          <HowItWorksSection />
          <ProfessionalSection />
          <PricingSection />
          <CtaSection />
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}
