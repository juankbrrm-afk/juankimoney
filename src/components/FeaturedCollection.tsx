import { Link } from "react-router-dom";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { EditorialImage } from "@/components/EditorialImage";

const featured = [
  {
    title: "The Tailoring Edit",
    copy: "Structured trousers, relaxed blazers — silhouettes built for the everyday.",
    href: "/shop?category=bottoms",
    scene: "architecture" as const,
  },
  {
    title: "Silk & Cashmere",
    copy: "Second-skin knitwear and fluid silk, layered for every season.",
    href: "/shop?category=knitwear",
    scene: "cafe" as const,
  },
];

export function FeaturedCollection() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-32">
      <RevealOnScroll className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
        {featured.map((f, i) => (
          <Link key={f.title} to={f.href} data-cursor-hover className="group block">
            <EditorialImage
              scene={f.scene}
              index={i}
              aspect="aspect-[4/5]"
              className="transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
            />
            <div className="mt-6 flex items-end justify-between">
              <div>
                <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {f.title}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-warmgray">
                  {f.copy}
                </p>
              </div>
              <span className="hidden shrink-0 text-[11px] font-semibold tracking-luxe uppercase text-warmgray transition-colors group-hover:text-black sm:inline">
                Discover
              </span>
            </div>
          </Link>
        ))}
      </RevealOnScroll>
    </section>
  );
}
