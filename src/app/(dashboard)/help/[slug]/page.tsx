"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HelpBody } from "@/components/help/HelpBody";
import { useAccess } from "@/lib/use-access";
import { useHelp } from "@/lib/use-help";
import { formatDate } from "@/lib/utils";

export default function HelpTopicPage() {
  const { slug } = useParams<{ slug: string }>();
  const { topics, loading, error } = useHelp();
  const { perms } = useAccess();
  const topic = topics.find((t) => t.slug === slug);

  const back = (
    <Link href="/help" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline md:hidden">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All topics
    </Link>
  );

  if (loading) return <div>{back}<div className="h-64 animate-pulse rounded-xl bg-muted" aria-busy="true" /></div>;
  if (error) return <div>{back}</div>; // the list beside it already explains the problem
  if (!topic) {
    return (
      <div>
        {back}
        <Card><CardContent className="p-8 text-center">
          <p className="font-medium">That topic is not available.</p>
          <p className="mt-1 text-sm text-muted-foreground">It may have been removed or is still a draft.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <article>
      {back}
      <Card>
        <CardContent className="space-y-5 p-5 md:p-8">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{topic.category}</p>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">{topic.title}</h1>
            {topic.summary && <p className="text-base text-muted-foreground">{topic.summary}</p>}
          </header>
          <hr />
          <HelpBody body={topic.body} />
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
            <span>Updated {formatDate(topic.updated_at)}</span>
            {perms.has("help.manage") && (
              <Link href={`/admin/help?edit=${encodeURIComponent(topic.slug)}`} className="inline-flex min-h-9 items-center gap-1.5 font-medium text-primary hover:underline">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit this topic
              </Link>
            )}
          </footer>
        </CardContent>
      </Card>
    </article>
  );
}
