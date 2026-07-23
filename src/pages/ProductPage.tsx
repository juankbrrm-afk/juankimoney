import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import clsx from "clsx";
import { getProductByHandle, getRelatedProducts } from "@/data/products";
import { EditorialImage } from "@/components/EditorialImage";
import { Accordion } from "@/components/Accordion";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";

export function ProductPage() {
  const { handle } = useParams();
  const product = handle ? getProductByHandle(handle) : undefined;

  const [color, setColor] = useState(product?.colors[0] ?? "");
  const [size, setSize] = useState(product?.sizes[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();

  if (!product) return <Navigate to="/404" replace />;
  const related = getRelatedProducts(product);
  const saved = has(product.id);

  return (
    <div className="pt-20 md:pt-24">
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:sticky md:top-0 md:h-screen md:grid-cols-1 md:gap-0 md:overflow-y-auto">
          <EditorialImage
            scene={product.scene}
            index={0}
            aspect="aspect-[4/5] md:aspect-auto md:h-screen"
            className="transition-transform duration-[1200ms] ease-out hover:scale-[1.04]"
          />
          <EditorialImage
            scene={product.scene}
            index={1}
            aspect="aspect-[4/5] md:aspect-auto md:h-screen"
            className="hidden transition-transform duration-[1200ms] ease-out hover:scale-[1.04] md:block"
          />
        </div>

        <div className="px-6 py-14 md:px-16 md:py-24">
          <div className="mx-auto max-w-md">
            <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
              {product.category}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {product.name}
            </h1>
            <p className="mt-4 text-lg">
              {product.compareAt ? (
                <>
                  <span className="mr-3 text-warmgray line-through">
                    {formatPrice(product.compareAt)}
                  </span>
                  <span>{formatPrice(product.price)}</span>
                </>
              ) : (
                formatPrice(product.price)
              )}
            </p>

            <p className="mt-8 text-sm leading-relaxed text-warmgray">
              {product.description}
            </p>

            <div className="mt-10">
              <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
                Color — {color}
              </p>
              <div className="mt-3 flex gap-3">
                {product.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-cursor-hover
                    onClick={() => setColor(c)}
                    className={clsx(
                      "px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors",
                      color === c
                        ? "border border-black bg-black text-ivory"
                        : "border border-black/20 text-black hover:border-black"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
                  Size
                </p>
                <button
                  type="button"
                  data-cursor-hover
                  onClick={() => setSizeGuideOpen(true)}
                  className="text-[11px] font-semibold tracking-wide uppercase text-warmgray underline underline-offset-4 hover:text-black"
                >
                  Size Guide
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-cursor-hover
                    onClick={() => setSize(s)}
                    className={clsx(
                      "h-11 min-w-11 px-3 text-xs font-semibold uppercase transition-colors",
                      size === s
                        ? "border border-black bg-black text-ivory"
                        : "border border-black/20 text-black hover:border-black"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <p className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
                Qty
              </p>
              <div className="flex items-center gap-4 text-sm">
                <button
                  type="button"
                  data-cursor-hover
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="h-8 w-8 border border-black/20 hover:border-black"
                >
                  −
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  data-cursor-hover
                  onClick={() => setQuantity((q) => q + 1)}
                  className="h-8 w-8 border border-black/20 hover:border-black"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-10 flex gap-3">
              <button
                type="button"
                data-cursor-hover
                onClick={() => addItem(product, color, size, quantity)}
                className="flex-1 bg-black py-4 text-[11px] font-semibold tracking-luxe uppercase text-ivory transition-opacity hover:opacity-85"
              >
                Add to Cart
              </button>
              <button
                type="button"
                data-cursor-hover
                onClick={() => toggle(product.id)}
                aria-label="Save to wishlist"
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-black/20 text-lg hover:border-black"
              >
                {saved ? "♥" : "♡"}
              </button>
            </div>

            <div className="mt-14">
              <Accordion
                items={[
                  {
                    title: "Shipping",
                    content:
                      "Complimentary shipping on all orders. Delivered within 3–5 business days, carefully packaged.",
                  },
                  {
                    title: "Returns",
                    content:
                      "Returns accepted within 30 days of delivery. Items must be unworn with tags attached.",
                  },
                  {
                    title: "Materials",
                    content: product.details.join(" · "),
                  },
                  {
                    title: "Care Instructions",
                    content:
                      "Dry clean recommended. Store on a padded hanger, away from direct sunlight.",
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="border-t border-black/10 px-6 py-20 md:px-10 md:py-28">
        <p className="text-center text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          Complete The Look
        </p>
        <div className="mx-auto mt-10 grid max-w-6xl grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-4 md:gap-x-6">
          {related.map((p, i) => (
            <Link key={p.id} to={`/shop/${p.handle}`} data-cursor-hover className="group">
              <EditorialImage
                scene={p.scene}
                index={i}
                aspect="aspect-[4/5]"
                className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
              <p className="mt-3 text-sm font-semibold tracking-tight">{p.name}</p>
              <p className="mt-1 text-xs text-warmgray">{formatPrice(p.price)}</p>
            </Link>
          ))}
        </div>
      </section>

      {sizeGuideOpen && (
        <SizeGuideModal onClose={() => setSizeGuideOpen(false)} />
      )}
    </div>
  );
}

function SizeGuideModal({ onClose }: { onClose: () => void }) {
  const rows = [
    ["XS", "32", "24", "34"],
    ["S", "34", "26", "36"],
    ["M", "36", "28", "38"],
    ["L", "38", "30", "40"],
    ["XL", "40", "32", "42"],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-ivory p-8"
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-luxe uppercase">Size Guide</p>
          <button
            type="button"
            data-cursor-hover
            onClick={onClose}
            className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray hover:text-black"
          >
            Close
          </button>
        </div>
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-[11px] uppercase tracking-wide text-warmgray">
              <th className="py-2">Size</th>
              <th className="py-2">Bust (in)</th>
              <th className="py-2">Waist (in)</th>
              <th className="py-2">Hip (in)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-black/5">
                {row.map((cell, i) => (
                  <td key={i} className="py-2.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-5 text-xs leading-relaxed text-warmgray">
          Measurements are approximate. For an in-between size, we recommend
          sizing up for a more relaxed fit.
        </p>
      </motion.div>
    </motion.div>
  );
}
