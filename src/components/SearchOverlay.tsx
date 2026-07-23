import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { useUI } from "@/hooks/useUI";
import { products } from "@/data/products";
import { EditorialImage } from "@/components/EditorialImage";
import { formatPrice } from "@/lib/format";

export function SearchOverlay() {
  const { searchOpen, setSearchOpen } = useUI();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query]);

  return (
    <AnimatePresence>
      {searchOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ivory pt-28"
        >
          <div className="mx-auto w-full max-w-3xl flex-1 px-6 md:px-0">
            <div className="flex items-end gap-6 border-b border-black/15 pb-5">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the collection"
                className="w-full bg-transparent text-[clamp(1.6rem,5vw,3rem)] font-semibold tracking-tight text-black placeholder:text-black/25 focus:outline-none"
              />
              <button
                type="button"
                data-cursor-hover
                onClick={() => setSearchOpen(false)}
                className="pb-2 text-[11px] font-semibold tracking-luxe uppercase text-warmgray hover:text-black"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 sm:grid-cols-2 md:grid-cols-3">
              {results.map((p) => (
                <Link
                  key={p.id}
                  to={`/shop/${p.handle}`}
                  onClick={() => setSearchOpen(false)}
                  data-cursor-hover
                  className="group"
                >
                  <EditorialImage scene={p.scene} className="transition-opacity group-hover:opacity-90" />
                  <p className="mt-3 text-sm font-semibold text-black">{p.name}</p>
                  <p className="mt-1 text-xs text-warmgray">{formatPrice(p.price)}</p>
                </Link>
              ))}
              {query && results.length === 0 && (
                <p className="col-span-full text-sm text-warmgray">
                  Nothing found for &ldquo;{query}&rdquo;. Try another search.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
