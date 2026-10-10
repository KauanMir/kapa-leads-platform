import { ArrowRightLeft, Inbox, MessageSquareText, Sparkles } from "lucide-react";

import type { TimelineItem } from "@/lib/admin/timeline";
import { formatDateTime } from "@/lib/format/datetime";

const ICONS = { created: Inbox, status: ArrowRightLeft, note: MessageSquareText, event: Sparkles };

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">Sem histórico.</p>;

  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-6">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <li key={item.key} className="relative">
            <span className="absolute -left-[37px] flex size-6 items-center justify-center rounded-full border border-line bg-surface">
              <Icon aria-hidden="true" className="size-3.5 text-muted" />
            </span>
            <p className="text-sm text-muted">
              <time dateTime={item.at} className="tabular-nums">
                {formatDateTime(item.at)}
              </time>
              {item.actor ? <> · {item.actor}</> : null}
            </p>
            <p className="font-medium">{item.title}</p>
            {/* Texto puro: o React escapa o conteúdo (sem HTML). */}
            {item.body ? <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-background px-3 py-2">{item.body}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
