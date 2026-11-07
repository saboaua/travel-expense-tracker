import { Lightbulb } from "lucide-react";
import { parseHelpBody, type HelpInline } from "@/lib/help";

function Inline({ parts }: { parts: HelpInline[] }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

/** A help topic's text as headings, steps, bullets and tips. Plain React elements only: the text is never treated as HTML. */
export function HelpBody({ body }: { body: string }) {
  const blocks = parseHelpBody(body);
  if (!blocks.length) return <p className="text-sm text-muted-foreground">This topic has no text yet.</p>;
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return <h2 key={i} className="pt-3 text-lg font-semibold tracking-tight first:pt-0">{b.text}</h2>;
          case "paragraph":
            return <p key={i}><Inline parts={b.inline} /></p>;
          case "bullets":
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
                {b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}
              </ul>
            );
          case "steps":
            return (
              <ol key={i} className="space-y-3">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{j + 1}</span>
                    <span className="min-w-0 flex-1"><Inline parts={it} /></span>
                  </li>
                ))}
              </ol>
            );
          case "tip":
            return (
              <div key={i} className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="min-w-0"><Inline parts={b.inline} /></p>
              </div>
            );
        }
      })}
    </div>
  );
}
