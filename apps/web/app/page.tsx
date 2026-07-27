import { ChatCanvas } from "@/components/ChatCanvas";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:py-16">
      <ChatCanvas />
    </main>
  );
}
