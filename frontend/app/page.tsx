import { CultureTable } from "@/components/culture-table";
import { getUpcomingEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function Page() {
  const events = await getUpcomingEvents();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {/* Header */}
        <header className="mb-12 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Culture Index
          </h1>
          <p className="text-sm text-muted-foreground">
            Theatre, cinema, concerts, exhibitions and more in and around your area.
          </p>
        </header>

        {/* Table */}
        <CultureTable events={events} />

        {/* Footer */}
        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          <span>Culture Index</span>
          <span className="mx-2">{"/"}</span>
          <span>Updated daily</span>
        </footer>
      </div>
    </main>
  );
}
