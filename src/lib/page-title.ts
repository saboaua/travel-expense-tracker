import type { Metadata } from "next";
import { getBrand } from "@/lib/brand-icon";

/** The tab title for a section: "Groceries · AppName". Used by layouts so the pages under them keep the app-name ending. */
export async function titled(title: string): Promise<Metadata> {
  const name = (await getBrand()).appName || "Travel Expense Tracker";
  return { title: { default: `${title} \u00b7 ${name}`, template: `%s \u00b7 ${name}` } };
}
