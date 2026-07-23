import { EditorialImage } from "@/components/EditorialImage";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { site } from "@/config/site";

const pillars = [
  {
    title: "Minimalism",
    body: "Nothing is added without reason. Every silhouette is reduced to what it needs to be, and nothing more.",
  },
  {
    title: "Timeless Silhouettes",
    body: "We design for the wardrobe, not the season. Shapes chosen to remain quietly correct for years.",
  },
  {
    title: "Premium Fabrics",
    body: "Mulberry silk, grade-A cashmere, European linen — sourced for how they feel, drape, and age.",
  },
  {
    title: "Confidence",
    body: "Clothing that asks nothing of the woman wearing it, and gives her everything in return.",
  },
];

export function About() {
  return (
    <div className="pt-24 md:pt-28">
      <section className="mx-auto max-w-4xl px-6 py-24 text-center md:px-10 md:py-32">
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          The House
        </span>
        <h1 className="mt-6 text-[clamp(2rem,6vw,4rem)] font-semibold leading-[1.05] tracking-tight text-balance">
          Our clothing is designed for women who value elegance over trends.
        </h1>
      </section>

      <RevealOnScroll className="grid grid-cols-1 gap-1 md:grid-cols-2">
        <EditorialImage scene="architecture" aspect="aspect-[4/5] md:aspect-auto md:h-[70vh]" label="Milan, Studio" />
        <div className="flex items-center bg-cream px-8 py-16 md:px-16">
          <div className="max-w-md">
            <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
              {site.philosophy.eyebrow}
            </p>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {site.philosophy.heading}
            </h2>
            <p className="mt-6 text-base leading-relaxed text-warmgray">
              {site.philosophy.body}
            </p>
          </div>
        </div>
      </RevealOnScroll>

      <section className="mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
        <div className="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2">
          {pillars.map((p) => (
            <div key={p.title}>
              <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-warmgray">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <RevealOnScroll className="grid grid-cols-1 gap-1 md:grid-cols-3">
        <EditorialImage scene="hotel" aspect="aspect-[3/4]" index={0} label="Paris" />
        <EditorialImage scene="coast" aspect="aspect-[3/4]" index={1} label="Amalfi Coast" />
        <EditorialImage scene="cafe" aspect="aspect-[3/4]" index={2} label="Lisbon" />
      </RevealOnScroll>

      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <p className="text-2xl font-semibold leading-relaxed tracking-tight text-balance md:text-3xl">
          Less noise. More elegance. {site.name} is not built for seasons —
          it is built to be worn.
        </p>
      </section>
    </div>
  );
}
