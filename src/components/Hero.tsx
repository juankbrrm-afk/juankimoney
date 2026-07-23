import { useLayoutEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap } from "@/lib/gsap";
import { EditorialImage } from "@/components/EditorialImage";
import { site } from "@/config/site";

export function Hero() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ delay: 0.3 })
        .fromTo(
          ".hero-frame",
          { scale: 1.12 },
          { scale: 1, duration: 2.6, ease: "power2.out" }
        )
        .fromTo(
          ".hero-eyebrow",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 1.1, ease: "power3.out" },
          "-=2.1"
        )
        .fromTo(
          ".hero-line",
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 1.3, ease: "power3.out", stagger: 0.12 },
          "-=0.8"
        )
        .fromTo(
          ".hero-cta",
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
          "-=0.6"
        )
        .fromTo(
          ".hero-scroll",
          { opacity: 0 },
          { opacity: 1, duration: 1.2, ease: "power2.out" },
          "-=0.4"
        );
    }, scopeRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={scopeRef} className="relative h-[100svh] w-full overflow-hidden bg-black">
      <div className="hero-frame absolute inset-0">
        <EditorialImage
          scene="hotel"
          aspect="h-full"
          className="h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/40" />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center text-white">
        <span className="hero-eyebrow text-[11px] font-semibold tracking-luxe uppercase text-white/80">
          {site.name} — {site.founded}
        </span>
        <h1 className="mt-6 max-w-4xl text-[clamp(2.4rem,7vw,5.5rem)] font-semibold leading-[1.02] tracking-tight text-balance">
          <span className="hero-line block">Designed for women</span>
          <span className="hero-line block">who move with confidence.</span>
        </h1>
        <motion.div className="hero-cta mt-10">
          <button
            type="button"
            data-cursor-hover
            onClick={() =>
              gsap.to(window, {
                scrollTo: "#collection",
                duration: 1.4,
                ease: "power3.inOut",
              })
            }
            className="inline-block border border-white/50 px-10 py-4 text-[11px] font-semibold tracking-luxe uppercase text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white hover:text-black"
          >
            {site.copy.ctaSecondary}
          </button>
        </motion.div>
      </div>

      <div className="hero-scroll absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-3 text-white/70">
        <span className="text-[10px] font-semibold tracking-luxe uppercase">Scroll</span>
        <span className="h-10 w-px bg-white/40" />
      </div>
    </section>
  );
}
