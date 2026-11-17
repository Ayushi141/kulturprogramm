"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import type { CultureEvent } from "@/lib/events-data";

type SortKey = "title" | "venue" | "startsAt";
type SortDir = "asc" | "desc";

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(iso));
}

export function CultureTable({ events }: { events: CultureEvent[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("startsAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return events
      .filter(
        (event) =>
          !query ||
          event.title.toLocaleLowerCase().includes(query) ||
          event.venue.toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => {
        const comparison =
          sortKey === "startsAt"
            ? a.startsAt.localeCompare(b.startsAt)
            : a[sortKey].localeCompare(b[sortKey]);
        return sortDir === "asc" ? comparison : -comparison;
      });
  }, [events, search, sortKey, sortDir]);

  const columns: { key: SortKey; label: string }[] = [
    { key: "title", label: "Event" },
    { key: "venue", label: "Venue" },
    { key: "startsAt", label: "Date and time" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search events or venues..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-md border border-border bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-xs tabular-nums text-muted-foreground">
        {filtered.length} upcoming event{filtered.length !== 1 ? "s" : ""}
      </p>

      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {sortKey === column.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-muted-foreground">
                  {events.length === 0 ? "No upcoming events yet." : "No events match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((event) => (
                <tr key={event.id} className="border-b border-border/50 transition-colors hover:bg-secondary/50">
                  <td className="px-3 py-3.5 font-medium text-foreground">{event.title}</td>
                  <td className="px-3 py-3.5 text-muted-foreground">{event.venue}</td>
                  <td className="px-3 py-3.5 tabular-nums text-muted-foreground">
                    {formatDateTime(event.startsAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
