import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { EditorialImage } from "@/components/EditorialImage";
import { formatPrice } from "@/lib/format";
import { site } from "@/config/site";

export function CartDrawer() {
  const { isOpen, close, lines, removeItem, updateQuantity, subtotal } = useCart();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col bg-black text-ivory"
          >
            <div className="flex items-center justify-between px-8 py-7">
              <p className="text-[11px] font-semibold tracking-luxe uppercase">
                Your Bag
              </p>
              <button
                type="button"
                onClick={close}
                data-cursor-hover
                className="text-[11px] font-semibold tracking-luxe uppercase text-ivory/60 hover:text-ivory"
              >
                Close
              </button>
            </div>

            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
                <p className="text-2xl font-semibold leading-snug text-balance">
                  {site.copy.emptyCart.heading}
                </p>
                <p className="text-sm leading-relaxed text-ivory/60">
                  {site.copy.emptyCart.body}
                </p>
                <Link
                  to="/shop"
                  onClick={close}
                  data-cursor-hover
                  className="mt-2 border border-ivory/30 px-8 py-3 text-[11px] font-semibold tracking-luxe uppercase transition-colors hover:border-ivory hover:bg-ivory hover:text-black"
                >
                  {site.copy.ctaSecondary}
                </Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 overflow-y-auto px-8">
                  {lines.map((line) => (
                    <li
                      key={line.key}
                      className="flex gap-4 border-t border-ivory/10 py-6 first:border-t-0"
                    >
                      <EditorialImage
                        scene={line.product.scene}
                        aspect="aspect-[4/5]"
                        className="w-24 shrink-0"
                      />
                      <div className="flex flex-1 flex-col justify-between">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{line.product.name}</p>
                            <p className="mt-1 text-xs text-ivory/50">
                              {line.color} · {line.size}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">
                            {formatPrice(line.product.price * line.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs">
                            <button
                              type="button"
                              data-cursor-hover
                              onClick={() => updateQuantity(line.key, line.quantity - 1)}
                              className="h-6 w-6 border border-ivory/20 text-ivory/70 hover:border-ivory hover:text-ivory"
                            >
                              −
                            </button>
                            <span>{line.quantity}</span>
                            <button
                              type="button"
                              data-cursor-hover
                              onClick={() => updateQuantity(line.key, line.quantity + 1)}
                              className="h-6 w-6 border border-ivory/20 text-ivory/70 hover:border-ivory hover:text-ivory"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            data-cursor-hover
                            onClick={() => removeItem(line.key)}
                            className="text-[11px] tracking-wide uppercase text-ivory/40 hover:text-ivory"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-ivory/10 px-8 py-7">
                  <div className="mb-5 flex items-center justify-between text-sm">
                    <span className="text-ivory/60">Subtotal</span>
                    <span className="font-semibold">{formatPrice(subtotal)}</span>
                  </div>
                  <button
                    type="button"
                    data-cursor-hover
                    className="w-full bg-ivory py-4 text-[11px] font-semibold tracking-luxe uppercase text-black transition-opacity hover:opacity-85"
                  >
                    Checkout
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    data-cursor-hover
                    className="mt-3 w-full py-2 text-[11px] font-semibold tracking-luxe uppercase text-ivory/50 hover:text-ivory"
                  >
                    Continue Shopping
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
