import { Link } from "react-router-dom";
import { site } from "@/config/site";

export function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 pt-24 text-center">
      <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
        404
      </span>
      <h1 className="mt-6 max-w-2xl text-[clamp(2rem,6vw,3.75rem)] font-semibold leading-[1.05] tracking-tight text-balance">
        {site.copy.notFound.heading}
      </h1>
      <p className="mt-6 max-w-md text-sm leading-relaxed text-warmgray">
        {site.copy.notFound.body}
      </p>
      <Link
        to="/"
        data-cursor-hover
        className="mt-10 border border-black/20 px-10 py-4 text-[11px] font-semibold tracking-luxe uppercase transition-colors hover:border-black hover:bg-black hover:text-ivory"
      >
        {site.copy.notFound.cta}
      </Link>
    </div>
  );
}
