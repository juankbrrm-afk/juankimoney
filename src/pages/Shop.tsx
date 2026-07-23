import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { products, categories } from "@/data/products";
import { EditorialImage } from "@/components/EditorialImage";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { formatPrice } from "@/lib/format";
import { useWishlist } from "@/hooks/useWishlist";

export function Shop() {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCategory = params.get("category");
  const activeFilter = params.get("filter");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      if (activeFilter === "new" && !p.tags.includes("new")) return false;
      if (activeFilter === "best-sellers" && !p.tags.includes("best-sellers"))
        return false;
      if (activeFilter === "sale" && !p.tags.includes("sale")) return false;
      return true;
    });
  }, [activeCategory, activeFilter]);

  const setCategory = (value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set("category", value);
    else next.delete("category");
    setParams(next, { replace: true });
  };

  return (
    <div className="pt-24 md:pt-28">
      <section className="mx-auto max-w-4xl px-6 pb-10 pt-16 text-center md:pt-24">
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          {activeFilter === "new"
            ? "New Arrivals"
            : activeFilter === "best-sellers"
              ? "Best Sellers"
              : activeFilter === "sale"
                ? "Sale"
                : "The Collection"}
        </span>
        <h1 className="mt-5 text-[clamp(1.9rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-balance">
          Curated pieces, considered edits.
        </h1>
      </section>

      <div className="sticky top-20 z-20 mx-auto flex max-w-[1600px] items-center justify-between border-y border-black/10 bg-ivory/90 px-6 py-4 backdrop-blur md:top-24 md:px-10">
        <div className="no-scrollbar flex gap-6 overflow-x-auto text-[11px] font-semibold tracking-luxe uppercase">
          <button
            type="button"
            data-cursor-hover
            onClick={() => setCategory(null)}
            className={clsx(
              "whitespace-nowrap transition-colors",
              !activeCategory ? "text-black" : "text-warmgray hover:text-black"
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.value}
              type="button"
              data-cursor-hover
              onClick={() => setCategory(c.value)}
              className={clsx(
                "whitespace-nowrap transition-colors",
                activeCategory === c.value
                  ? "text-black"
                  : "text-warmgray hover:text-black"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-cursor-hover
          onClick={() => setFiltersOpen(true)}
          className="whitespace-nowrap pl-6 text-[11px] font-semibold tracking-luxe uppercase text-warmgray hover:text-black"
        >
          Filters
        </button>
      </div>

      <RevealOnScroll
        className="mx-auto grid max-w-[1600px] grid-cols-2 gap-x-4 gap-y-16 px-6 py-16 md:grid-cols-3 md:gap-x-6 md:gap-y-24 md:px-10 md:py-24"
        stagger={0.08}
      >
        {filtered.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </RevealOnScroll>

      {filtered.length === 0 && (
        <p className="px-6 pb-24 text-center text-sm text-warmgray">
          No pieces match this edit yet.
        </p>
      )}

      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        activeCategory={activeCategory}
        setCategory={setCategory}
      />
    </div>
  );
}

function ProductCard({
  product,
  index,
}: {
  product: (typeof products)[number];
  index: number;
}) {
  const { has, toggle } = useWishlist();
  const saved = has(product.id);
  const asymmetric = index % 5 === 2;

  return (
    <div className={clsx(asymmetric && "md:mt-16")}>
      <div className="group relative">
        <Link to={`/shop/${product.handle}`} data-cursor-hover>
          <EditorialImage
            scene={product.scene}
            index={index}
            aspect="aspect-[4/5]"
            className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        </Link>
        <button
          type="button"
          data-cursor-hover
          onClick={() => toggle(product.id)}
          aria-label="Save to wishlist"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ivory/90 text-black transition-transform duration-300 hover:scale-110"
        >
          <span className={clsx("text-sm transition-colors", saved ? "text-black" : "text-black/40")}>
            {saved ? "♥" : "♡"}
          </span>
        </button>
        {product.tags.includes("sale") && (
          <span className="absolute left-3 top-3 bg-ivory/90 px-2 py-1 text-[10px] font-semibold tracking-luxe uppercase">
            Sale
          </span>
        )}
      </div>
      <Link to={`/shop/${product.handle}`} data-cursor-hover className="mt-4 block">
        <p className="text-sm font-semibold tracking-tight">{product.name}</p>
        <p className="mt-1 text-xs text-warmgray">
          {product.compareAt ? (
            <>
              <span className="mr-2 line-through">{formatPrice(product.compareAt)}</span>
              <span className="text-black">{formatPrice(product.price)}</span>
            </>
          ) : (
            formatPrice(product.price)
          )}
        </p>
      </Link>
    </div>
  );
}

function FiltersDrawer({
  open,
  onClose,
  activeCategory,
  setCategory,
}: {
  open: boolean;
  onClose: () => void;
  activeCategory: string | null;
  setCategory: (v: string | null) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm bg-ivory px-8 py-8"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-luxe uppercase">Filters</p>
              <button
                type="button"
                data-cursor-hover
                onClick={onClose}
                className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray hover:text-black"
              >
                Close
              </button>
            </div>

            <div className="mt-10">
              <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
                Category
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                <li>
                  <button
                    type="button"
                    data-cursor-hover
                    onClick={() => setCategory(null)}
                    className={clsx(
                      "text-sm",
                      !activeCategory ? "font-semibold text-black" : "text-warmgray"
                    )}
                  >
                    All
                  </button>
                </li>
                {categories.map((c) => (
                  <li key={c.value}>
                    <button
                      type="button"
                      data-cursor-hover
                      onClick={() => setCategory(c.value)}
                      className={clsx(
                        "text-sm",
                        activeCategory === c.value
                          ? "font-semibold text-black"
                          : "text-warmgray"
                      )}
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
