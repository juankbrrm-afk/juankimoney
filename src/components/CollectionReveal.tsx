import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { EditorialImage, type Scene } from "@/components/EditorialImage";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { site } from "@/config/site";

const gallery: { scene: Scene; className: string }[] = [
  { scene: "architecture", className: "col-span-3 row-span-4 md:col-start-2" },
  { scene: "hotel", className: "col-span-3 row-span-3 md:col-start-6 md:row-start-2" },
  { scene: "coast", className: "col-span-2 row-span-3 md:col-start-9 md:row-start-1" },
  { scene: "street", className: "col-span-3 row-span-3 md:col-start-3 md:row-start-6" },
  { scene: "cafe", className: "col-span-2 row-span-2 md:col-start-7 md:row-start-6" },
  { scene: "villa", className: "col-span-3 row-span-3 md:col-start-9 md:row-start-5" },
];

export function CollectionReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const panel = panelRef.current;
    const galleryEl = galleryRef.current;
    const cta = ctaRef.current;
    if (!section || !panel || !galleryEl || !cta) return;

    const items = Array.from(galleryEl.children);

    const ctx = gsap.context(() => {
      gsap.set(panel, { yPercent: 100 });
      gsap.set(items, { opacity: 0, y: 56, scale: 0.94 });
      gsap.set(cta, { opacity: 0, y: 24 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=350%",
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
        },
      });

      tl.to(panel, { yPercent: 0, duration: 1, ease: "power2.out" })
        .to(
          items,
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 1,
            ease: "power2.out",
            stagger: 0.12,
          },
          "-=0.2"
        )
        .to(items, { opacity: 1 }, "+=0.3")
        .to(panel, { yPercent: -100, duration: 1, ease: "power2.inOut" })
        .to(cta, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, "-=0.4");
    }, section);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((t) => t.trigger === section && t.kill());
    };
  }, []);

  return (
    <section id="collection" ref={sectionRef} className="relative h-[100svh] w-full overflow-hidden bg-ivory">
      <div
        ref={ctaRef}
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
      >
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          The Collection
        </span>
        <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-tight text-balance">
          Every silhouette tells a story.
        </h2>
        <Link
          to="/shop"
          data-cursor-hover
          className="mt-10 border border-black px-10 py-4 text-[11px] font-semibold tracking-luxe uppercase transition-colors hover:bg-black hover:text-ivory"
        >
          {site.copy.ctaPrimary}
        </Link>
      </div>

      <div ref={panelRef} className="absolute inset-0 bg-black">
        <div
          ref={galleryRef}
          className="mx-auto grid h-full max-w-[1700px] grid-cols-6 grid-rows-8 gap-3 px-6 py-10 md:grid-cols-12 md:gap-4 md:px-10"
        >
          {gallery.map((g, i) => (
            <EditorialImage
              key={i}
              scene={g.scene}
              index={i}
              aspect="h-full"
              className={`${g.className} h-full w-full`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
