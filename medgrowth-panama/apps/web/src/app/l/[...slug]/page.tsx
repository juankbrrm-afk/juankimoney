import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LandingLeadForm } from "@/components/LandingLeadForm";

interface LandingContent {
  headline?: string;
  subheadline?: string;
  cta?: string;
}

export default async function PublicLandingPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.join("/");
  const landingPage = await db.landingPage.findUnique({ where: { slug } });

  if (!landingPage || !landingPage.published) notFound();

  const content = landingPage.content as LandingContent;

  return (
    <main className="min-h-screen bg-brand-950 text-white">
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-3xl font-bold sm:text-5xl">{content.headline ?? landingPage.title}</h1>
        {content.subheadline && <p className="mt-4 text-lg text-brand-100">{content.subheadline}</p>}

        <div className="mx-auto mt-10 max-w-md rounded-xl bg-white p-6 text-left shadow-xl">
          <LandingLeadForm slug={slug} ctaLabel={content.cta ?? "Quiero mi consulta"} />
        </div>
      </div>
    </main>
  );
}
