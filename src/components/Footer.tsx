import { Link } from "react-router-dom";
import { site } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-ivory px-6 pb-8 pt-20 md:px-10">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-16 md:flex-row md:justify-between">
        <div className="max-w-sm">
          <p className="font-semibold tracking-luxe text-2xl text-black">{site.name}</p>
          <p className="mt-4 text-sm leading-relaxed text-warmgray">
            {site.descriptor}
          </p>
          <div className="mt-6 flex gap-4 text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
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
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <FooterColumn
            title="Shop"
            links={[
              { label: "New Arrivals", href: "/shop?filter=new" },
              { label: "Best Sellers", href: "/shop?filter=best-sellers" },
              { label: "Sale", href: "/shop?filter=sale" },
            ]}
          />
          <FooterColumn
            title="House"
            links={[
              { label: "About", href: "/about" },
              { label: "Journal", href: "/journal" },
              { label: "Contact", href: "/contact" },
            ]}
          />
          <FooterColumn
            title="Client Care"
            links={[
              { label: "Shipping & Returns", href: "/contact" },
              { label: "Size Guide", href: "/shop" },
              { label: "Contact", href: "/contact" },
            ]}
          />
        </div>
      </div>

      <div className="mx-auto mt-20 flex max-w-[1600px] flex-col-reverse items-start justify-between gap-4 border-t border-black/10 pt-6 text-[11px] tracking-luxe uppercase text-warmgray sm:flex-row sm:items-center">
        <span>
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </span>
        <span>{site.contact.address}</span>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-luxe uppercase text-black">
        {title}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.href}
              data-cursor-hover
              className="text-sm text-warmgray transition-colors hover:text-black"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
