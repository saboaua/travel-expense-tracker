import { BookOpen } from "lucide-react";

// Phone: the list is shown by the layout and this is hidden. Desktop: this fills the right side until a topic is chosen.
export default function HelpHome() {
  return (
    <div className="hidden rounded-xl border border-dashed p-10 text-center md:block">
      <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 font-medium">Choose a topic</p>
      <p className="mt-1 text-sm text-muted-foreground">Pick one on the left, or search for what you need.</p>
    </div>
  );
}
