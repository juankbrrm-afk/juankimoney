import { AnimatePresence, motion, type Variants } from "motion/react";
import { Link } from "react-router-dom";
import { site } from "@/config/site";
import { useUI } from "@/hooks/useUI";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.18 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

export function MenuOverlay() {
  const { menuOpen, setMenuOpen } = useUI();

  return (
    <AnimatePresence>
      {menuOpen && (
        <motion.div
          initial={{ clipPath: "inset(0 0 100% 0)" }}
          animate={{ clipPath: "inset(0 0 0% 0)" }}
          exit={{ clipPath: "inset(0 0 100% 0)" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ivory pt-24 md:pt-28"
        >
          <motion.nav
            variants={container}
            initial="hidden"
            animate="show"
            className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center gap-10 px-6 py-16 md:flex-row md:gap-24 md:px-10"
          >
            <ul className="flex flex-col gap-2 md:gap-3">
              {site.menu.primary.map((entry) => (
                <motion.li key={entry.label} variants={item}>
                  <Link
                    to={entry.href}
                    onClick={() => setMenuOpen(false)}
                    data-cursor-hover
                    className="group inline-flex items-baseline gap-4 font-semibold leading-[1.05] tracking-tight text-black transition-opacity hover:opacity-60 text-[clamp(2.2rem,7vw,5rem)]"
                  >
                    {entry.label}
                  </Link>
                </motion.li>
              ))}
            </ul>

            <div className="flex flex-col justify-between gap-16 md:max-w-xs">
              <ul className="flex flex-col gap-4">
                {site.menu.secondary.map((entry) => (
                  <motion.li key={entry.label} variants={item}>
                    <Link
                      to={entry.href}
                      onClick={() => setMenuOpen(false)}
                      data-cursor-hover
                      className="text-sm font-semibold tracking-luxe uppercase text-warmgray transition-colors hover:text-black"
                    >
                      {entry.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>

              <motion.div variants={item} className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-warmgray">
                  {site.descriptor}
                </p>
                <div className="flex gap-4 text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
                  {site.social.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      data-cursor-hover
                      className="transition-colors hover:text-black"
                    >
                      {s.label}
                    </a>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.nav>

          <motion.div
            variants={item}
            initial="hidden"
            animate="show"
            className="border-t border-black/10 px-6 py-6 text-[11px] tracking-luxe uppercase text-warmgray md:px-10"
          >
            {site.contact.address}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
