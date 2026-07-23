import { Hero } from "@/components/Hero";
import { CollectionReveal } from "@/components/CollectionReveal";
import { FeaturedCollection } from "@/components/FeaturedCollection";
import { BestSellers } from "@/components/BestSellers";
import { Philosophy } from "@/components/Philosophy";
import { LifestyleGallery } from "@/components/LifestyleGallery";
import { Newsletter } from "@/components/Newsletter";

export function Home() {
  return (
    <>
      <Hero />
      <CollectionReveal />
      <FeaturedCollection />
      <BestSellers />
      <Philosophy />
      <LifestyleGallery />
      <Newsletter />
    </>
  );
}
