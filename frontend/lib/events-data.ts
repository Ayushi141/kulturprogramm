export interface CultureEvent {
  id: number;
  title: string;
  venue: string;
  category: string;
  startsAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  film: "Film",
  theater: "Theater",
  oper: "Oper",
  konzert: "Konzert",
};

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category;
}
