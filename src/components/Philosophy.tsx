import { RevealOnScroll } from "@/components/RevealOnScroll";
import { site } from "@/config/site";

export function Philosophy() {
  return (
    <section className="px-6 py-28 md:px-10 md:py-40">
      <RevealOnScroll className="mx-auto max-w-3xl text-center">
        <span className="block text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          {site.philosophy.eyebrow}
        </span>
        <p className="mt-8 text-[clamp(1.5rem,4vw,2.75rem)] font-semibold leading-[1.2] tracking-tight text-balance">
          {site.philosophy.heading} {site.philosophy.body}
        </p>
      </RevealOnScroll>
    </section>
  );
}
