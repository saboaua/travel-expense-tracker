export type PersonalKind = "home_project" | "personal_trip";

export const PROJECT_CATEGORIES = ["Materials", "Tools", "Labor", "Permits & Fees", "Delivery", "Appliances", "Furniture", "Decor", "Other"];
export const TRAVEL_CATEGORIES = ["Flights", "Lodging", "Food", "Transport", "Activities", "Shopping", "Other"];
export const GROCERY_CATEGORIES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Beverages", "Snacks", "Frozen", "Household", "Personal Care", "Other",
];

export const KIND_META: Record<
  PersonalKind,
  { label: string; plural: string; path: string; categories: string[]; noun: string }
> = {
  home_project: { label: "Home project", plural: "Home Projects", path: "/personal/projects", categories: PROJECT_CATEGORIES, noun: "project" },
  personal_trip: { label: "Personal trip", plural: "Personal Travel", path: "/personal/travel", categories: TRAVEL_CATEGORIES, noun: "trip" },
};

export type PersonalProject = {
  id: string;
  user_id: string;
  kind: PersonalKind;
  name: string;
  destination: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  status: "active" | "completed";
  created_at: string;
};

export type PersonalExpense = {
  id: string;
  project_id: string;
  merchant: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_usd: number;
  category: string;
  expense_date: string;
  notes: string | null;
  receipt_path: string | null;
};
