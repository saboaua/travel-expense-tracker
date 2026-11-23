import { redirect } from "next/navigation";

export const metadata = { title: "Community prices" };

// The Community prices page moved into Best Prices (search any item there)
export default function Page() {
  redirect("/personal/groceries/basket");
}
