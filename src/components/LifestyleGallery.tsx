import { EditorialImage, type Scene } from "@/components/EditorialImage";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const scenes: { scene: Scene; aspect: string; label: string }[] = [
  { scene: "coast", aspect: "aspect-[3/4]", label: "Amalfi" },
  { scene: "cafe", aspect: "aspect-square", label: "Lisbon" },
  { scene: "villa", aspect: "aspect-[3/4]", label: "Mallorca" },
  { scene: "street", aspect: "aspect-square", label: "Paris" },
  { scene: "hotel", aspect: "aspect-[3/4]", label: "Milan" },
];

export function LifestyleGallery() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          The Lifestyle
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
          Worn in the world, not just photographed for it.
        </h2>
      </div>

      <RevealOnScroll
        className="mx-auto flex max-w-[1700px] gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:gap-5 md:overflow-visible"
        stagger={0.08}
      >
        {scenes.map((s, i) => (
          <EditorialImage
            key={s.label}
            scene={s.scene}
            index={i}
            aspect={s.aspect}
            label={s.label}
            className="w-56 shrink-0 transition-transform duration-700 ease-out hover:scale-[1.02] md:w-auto"
          />
        ))}
      </RevealOnScroll>
    </section>
  );
}
