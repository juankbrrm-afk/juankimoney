import { EditorialImage, type Scene } from "@/components/EditorialImage";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const entries: { title: string; excerpt: string; scene: Scene; category: string }[] = [
  {
    title: "The Case for a Considered Wardrobe",
    excerpt:
      "Why we design in seasons of one — pieces meant to be worn for years, not scrolled past in weeks.",
    scene: "studio",
    category: "Philosophy",
  },
  {
    title: "Notes from Milan",
    excerpt:
      "Inside the ateliers where our knitwear is made, and the hands behind every stitch.",
    scene: "architecture",
    category: "Craft",
  },
  {
    title: "Styling the Silk Slip, Three Ways",
    excerpt:
      "From a Parisian morning to a rooftop evening — one dress, three entirely different moods.",
    scene: "hotel",
    category: "Styling",
  },
  {
    title: "On Quiet Luxury",
    excerpt:
      "Luxury isn't loud. A short essay on restraint, fabric, and why the best pieces say the least.",
    scene: "night",
    category: "Philosophy",
  },
];

export function Journal() {
  return (
    <div className="pt-24 md:pt-28">
      <section className="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          Journal
        </span>
        <h1 className="mt-6 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-tight text-balance">
          Notes on craft, style, and the world we design for.
        </h1>
      </section>

      <RevealOnScroll className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 gap-y-16 px-6 pb-28 md:grid-cols-2 md:px-10">
        {entries.map((entry, i) => (
          <article key={entry.title} className="group cursor-default" data-cursor-hover>
            <EditorialImage
              scene={entry.scene}
              index={i}
              aspect="aspect-[3/2]"
              className="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />
            <p className="mt-6 text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
              {entry.category}
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
              {entry.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-warmgray">
              {entry.excerpt}
            </p>
          </article>
        ))}
      </RevealOnScroll>
    </div>
  );
}
