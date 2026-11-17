"use client";

import { useState, useMemo } from "react";
import {
  events,
  type CultureEvent,
  type EventCategory,
} from "@/lib/events-data";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
} from "lucide-react";

const ALL_CATEGORIES: EventCategory[] = [
  "Theatre",
  "Cinema",
  "Music",
  "Exhibition",
  "Comedy",
  "Dance",
  "Opera",
  "Festival",
];

const STATUS_OPTIONS = ["On Sale", "Sold Out", "Few Left", "Free"] as const;

type SortKey = keyof CultureEvent;
type SortDir = "asc" | "desc";

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: CultureEvent["status"] }) {
  const styles: Record<CultureEvent["status"], string> = {
    "On Sale": "bg-foreground/5 text-foreground",
    "Sold Out": "bg-foreground/5 text-muted-foreground line-through",
    "Few Left": "bg-foreground/10 text-foreground font-medium",
    Free: "bg-foreground/5 text-foreground",
  };

  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function CultureTable() {
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set()
  );
  const [activeStatuses, setActiveStatuses] = useState<
    Set<CultureEvent["status"]>
  >(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleCategory(cat: EventCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleStatus(status: CultureEvent["status"]) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearAll() {
    setSearch("");
    setActiveCategories(new Set());
    setActiveStatuses(new Set());
  }

  const hasFilters =
    search.length > 0 || activeCategories.size > 0 || activeStatuses.size > 0;

  const filtered = useMemo(() => {
    let result = [...events];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.neighborhood.toLowerCase().includes(q)
      );
    }

    if (activeCategories.size > 0) {
      result = result.filter((e) => activeCategories.has(e.category));
    }

    if (activeStatuses.size > 0) {
      result = result.filter((e) => activeStatuses.has(e.status));
    }

    result.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return result;
  }, [search, activeCategories, activeStatuses, sortKey, sortDir]);

  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: "title", label: "Event", className: "text-left min-w-[200px]" },
    { key: "category", label: "Category", className: "text-left" },
    { key: "venue", label: "Venue", className: "text-left hidden md:table-cell" },
    { key: "date", label: "Date", className: "text-left" },
    { key: "time", label: "Time", className: "text-left hidden sm:table-cell" },
    { key: "neighborhood", label: "Area", className: "text-left hidden lg:table-cell" },
    { key: "price", label: "Price", className: "text-right hidden sm:table-cell" },
    { key: "status", label: "Status", className: "text-right" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search events, venues, neighborhoods..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Category
          </span>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeCategories.has(cat)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-secondary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Status
          </span>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeStatuses.has(status)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-secondary"
              }`}
            >
              {status}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground tabular-nums">
        {filtered.length} event{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-3 font-medium text-xs uppercase tracking-widest text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors ${col.className}`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-16 text-center text-muted-foreground"
                >
                  No events match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((event, i) => (
                <tr
                  key={event.id}
                  className={`border-b border-border/50 transition-colors hover:bg-secondary/50 ${
                    event.status === "Sold Out" ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-3.5 px-3 font-medium text-foreground">
                    {event.title}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground">
                    {event.category}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground hidden md:table-cell">
                    {event.venue}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground tabular-nums">
                    {formatDate(event.date)}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground tabular-nums hidden sm:table-cell">
                    {event.time}
                  </td>
                  <td className="py-3.5 px-3 text-muted-foreground hidden lg:table-cell">
                    {event.neighborhood}
                  </td>
                  <td className="py-3.5 px-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                    {event.price}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <StatusBadge status={event.status} />
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
