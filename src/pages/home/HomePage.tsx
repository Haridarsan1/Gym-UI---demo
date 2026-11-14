import { useEffect } from "react";
import { Navbar } from "./sections/Navbar";
import { Hero } from "./sections/Hero";
import { RoleTour } from "./sections/RoleTour";
import { DeskDemo } from "./sections/DeskDemo";
import { Features } from "./sections/Features";
import { ProgressStory } from "./sections/ProgressStory";
import { Stories } from "./sections/Stories";
import { Pricing } from "./sections/Pricing";
import { Faq } from "./sections/Faq";
import { FinalCta } from "./sections/FinalCta";
import { Footer } from "./sections/Footer";
import { brand } from "@/config/brand";

export default function HomePage() {
  useEffect(() => {
    document.title = `${brand.name} · Gym management software for owners, trainers and members`;
  }, []);
  return (
    <div className="bg-clay-canvas text-clay-ink">
      <a href="#main" className="sr-only z-[60] rounded-full bg-clay-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <RoleTour />
        <DeskDemo />
        <Features />
        <ProgressStory />
        <Stories />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
