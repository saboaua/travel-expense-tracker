import { redirect } from "next/navigation";

// The Community prices page moved into Best Prices (search any item there)
export default function Page() {
  redirect("/personal/groceries/basket");
}
