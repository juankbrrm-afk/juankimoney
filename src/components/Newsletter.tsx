import { useState } from "react";
import { site } from "@/config/site";

export function Newsletter() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="border-t border-black/10 px-6 py-24 text-center md:py-32">
      <div className="mx-auto max-w-md">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {site.copy.newsletter.heading}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-warmgray">
          {site.copy.newsletter.body}
        </p>

        {submitted ? (
          <p className="mt-8 text-sm text-warmgray">Thank you — you're on the list.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
            className="mx-auto mt-8 flex max-w-sm items-center gap-3 border-b border-black/20 pb-3"
          >
            <input
              type="email"
              required
              placeholder="Email address"
              className="w-full bg-transparent text-sm placeholder:text-warmgray/70 focus:outline-none"
            />
            <button
              type="submit"
              data-cursor-hover
              className="shrink-0 text-[11px] font-semibold tracking-luxe uppercase text-black transition-opacity hover:opacity-60"
            >
              {site.copy.newsletter.cta}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
