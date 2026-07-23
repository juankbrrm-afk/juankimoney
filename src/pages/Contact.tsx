import { useState } from "react";
import { site } from "@/config/site";

export function Contact() {
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-6 pb-24 pt-32 md:grid-cols-2 md:px-10 md:pt-40">
      <div>
        <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
          Contact
        </span>
        <h1 className="mt-6 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-tight text-balance">
          We're here for anything you need.
        </h1>
        <p className="mt-6 max-w-sm text-sm leading-relaxed text-warmgray">
          For styling questions, order support, or press inquiries, reach us
          directly. We reply within one business day.
        </p>

        <dl className="mt-14 flex flex-col gap-8">
          <div>
            <dt className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
              Email
            </dt>
            <dd className="mt-2 text-base">{site.contact.email}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
              Ateliers
            </dt>
            <dd className="mt-2 text-base">{site.contact.address}</dd>
          </div>
        </dl>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
        className="flex flex-col gap-8 border-t border-black/10 pt-10 md:border-t-0 md:pt-0"
      >
        {sent ? (
          <p className="text-lg leading-relaxed text-balance">
            Thank you for reaching out. A member of our team will be in touch
            shortly.
          </p>
        ) : (
          <>
            <Field label="Name" name="name" />
            <Field label="Email" name="email" type="email" />
            <Field label="Message" name="message" textarea />
            <button
              type="submit"
              data-cursor-hover
              className="mt-2 w-fit border border-black px-10 py-4 text-[11px] font-semibold tracking-luxe uppercase transition-colors hover:bg-black hover:text-ivory"
            >
              Send Message
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  textarea = false,
}: {
  label: string;
  name: string;
  type?: string;
  textarea?: boolean;
}) {
  const shared =
    "w-full border-b border-black/20 bg-transparent pb-3 text-base focus:border-black focus:outline-none";
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold tracking-luxe uppercase text-warmgray">
        {label}
      </span>
      {textarea ? (
        <textarea name={name} required rows={4} className={shared} />
      ) : (
        <input name={name} type={type} required className={shared} />
      )}
    </label>
  );
}
