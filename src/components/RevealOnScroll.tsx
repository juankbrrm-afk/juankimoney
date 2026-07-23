import { useLayoutEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { gsap, ScrollTrigger } from "@/lib/gsap";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  stagger?: number;
  y?: number;
}

export function RevealOnScroll({
  children,
  className,
  as = "div",
  stagger = 0.12,
  y = 48,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const Tag = as as "div";

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = Array.from(el.children);
    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.set(targets, { opacity: 0, y });
      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power3.out",
        stagger,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          once: true,
        },
      });
    }, el);

    return () => {
      ctx.revert();
      ScrollTrigger.getAll().forEach((t) => t.trigger === el && t.kill());
    };
  }, [stagger, y]);

  return (
    <Tag ref={ref} className={clsx(className)}>
      {children}
    </Tag>
  );
}
