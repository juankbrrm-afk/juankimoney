import { Link } from "react-router-dom";
import clsx from "clsx";
import { products } from "@/data/products";
import { EditorialImage } from "@/components/EditorialImage";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { formatPrice } from "@/lib/format";

export function BestSellers() {
  const items = products.filter((p) => p.tags.includes("best-sellers")).slice(0, 5);

  return (
    <section className="bg-cream px-6 py-24 md:px-10 md:py-32">
      <div className="mx-auto flex max-w-[1600px] items-end justify-between">
        <div>
          <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
            Best Sellers
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
            Pieces our clients return to.
          </h2>
        </div>
        <Link
          to="/shop?filter=best-sellers"
          data-cursor-hover
          className="hidden shrink-0 text-[11px] font-semibold tracking-luxe uppercase text-warmgray transition-colors hover:text-black sm:inline"
        >
          View All
        </Link>
      </div>

      <RevealOnScroll
        className="mx-auto mt-14 grid max-w-[1600px] grid-cols-2 gap-x-4 gap-y-14 md:grid-cols-5 md:gap-x-5"
        stagger={0.08}
      >
        {items.map((p, i) => (
          <Link
            key={p.id}
            to={`/shop/${p.handle}`}
            data-cursor-hover
            className={clsx("group block", i % 3 === 1 && "md:mt-10")}
          >
            <EditorialImage
              scene={p.scene}
              index={i}
              aspect="aspect-[4/5]"
              className="transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
            <p className="mt-4 text-sm font-semibold tracking-tight">{p.name}</p>
            <p className="mt-1 text-xs text-warmgray">{formatPrice(p.price)}</p>
          </Link>
        ))}
      </RevealOnScroll>
    </section>
  );
}
