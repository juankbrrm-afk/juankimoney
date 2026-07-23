import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { site } from "@/config/site";
import { useUI } from "@/hooks/useUI";
import { useCart } from "@/hooks/useCart";

interface HeaderProps {
  transparentUntilScroll?: boolean;
}

export function Header({ transparentUntilScroll = false }: HeaderProps) {
  const { menuOpen, setMenuOpen, searchOpen, setSearchOpen } = useUI();
  const { count, open: openCart } = useCart();
  const [scrolled, setScrolled] = useState(!transparentUntilScroll);

  useEffect(() => {
    if (!transparentUntilScroll) return;
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparentUntilScroll]);

  const dark = scrolled || menuOpen;
  const light = !dark;

  return (
    <header
      className={clsx(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-700 ease-out",
        dark ? "bg-ivory/90 backdrop-blur-md" : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-6 md:h-24 md:px-10">
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          data-cursor-hover
          className={clsx(
            "flex items-center gap-3 text-[11px] font-semibold tracking-luxe uppercase transition-colors duration-500",
            light ? "text-white" : "text-black"
          )}
        >
          <span className="relative flex h-3.5 w-4 flex-col justify-between">
            <span
              className={clsx(
                "block h-px w-full bg-current transition-transform duration-500 ease-out",
                menuOpen && "translate-y-[6.5px] rotate-45"
              )}
            />
            <span
              className={clsx(
                "block h-px w-full bg-current transition-opacity duration-300",
                menuOpen && "opacity-0"
              )}
            />
            <span
              className={clsx(
                "block h-px w-full bg-current transition-transform duration-500 ease-out",
                menuOpen && "-translate-y-[6.5px] -rotate-45"
              )}
            />
          </span>
          <span className="hidden sm:inline">{menuOpen ? "Close" : "Menu"}</span>
        </button>

        <Link
          to="/"
          data-cursor-hover
          className={clsx(
            "absolute left-1/2 -translate-x-1/2 font-semibold tracking-luxe text-lg transition-colors duration-500 md:text-xl",
            light ? "text-white" : "text-black"
          )}
        >
          {site.name}
        </Link>

        <div
          className={clsx(
            "flex items-center gap-5 text-[11px] font-semibold tracking-luxe uppercase transition-colors duration-500",
            light ? "text-white" : "text-black"
          )}
        >
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            data-cursor-hover
            aria-label="Search"
            className="opacity-90 hover:opacity-100"
          >
            Search
          </button>
          <button
            type="button"
            onClick={openCart}
            data-cursor-hover
            aria-label="Bag"
            className="opacity-90 hover:opacity-100"
          >
            Bag{count > 0 ? ` (${count})` : ""}
          </button>
        </div>
      </div>
    </header>
  );
}
