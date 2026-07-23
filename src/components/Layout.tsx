import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { MenuOverlay } from "@/components/MenuOverlay";
import { SearchOverlay } from "@/components/SearchOverlay";
import { CartDrawer } from "@/components/CartDrawer";
import { Footer } from "@/components/Footer";
import { Cursor } from "@/components/Cursor";
import { useUI } from "@/hooks/useUI";
import { site } from "@/config/site";

export function Layout() {
  const { pathname } = useLocation();
  const { menuOpen, setMenuOpen, searchOpen, setSearchOpen } = useUI();
  const isHome = pathname === "/";

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo(0, 0);
    document.title = `${site.name} — ${site.tagline}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen ? "hidden" : "";
  }, [menuOpen, searchOpen]);

  return (
    <div className="min-h-screen bg-ivory">
      <Cursor />
      <Header transparentUntilScroll={isHome} />
      <MenuOverlay />
      <SearchOverlay />
      <CartDrawer />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
