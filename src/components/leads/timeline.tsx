import { ArrowRightLeft, Eye, Inbox, MessageSquareText, Sparkles, UserCheck } from "lucide-react";

import type { TimelineItem } from "@/lib/admin/timeline";
import { formatDateTime, formatDayLabel, formatTime } from "@/lib/format/datetime";

const KINDS = {
  created: { icon: Inbox, tone: "bg-blue-50 text-blue-600 ring-blue-100" },
  status: { icon: ArrowRightLeft, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  note: { icon: MessageSquareText, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  assigned: { icon: UserCheck, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  audit: { icon: Eye, tone: "bg-surface-sunken text-muted ring-line" },
  event: { icon: Sparkles, tone: "bg-surface-sunken text-muted ring-line" },
};

/** Histórico do lead: mais recente primeiro, agrupado por dia. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">Sem histórico.</p>;

  const now = new Date();
  const groups: Array<{ label: string; items: TimelineItem[] }> = [];
  for (const item of [...items].reverse()) {
    const label = formatDayLabel(item.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
            {group.label}
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </p>
          <ol className="flex flex-col">
            {group.items.map((item, index) => {
              const { icon: Icon, tone } = KINDS[item.kind];
              const isLast = index === group.items.length - 1;
              return (
                <li key={item.key} className="relative flex gap-3 pb-4 last:pb-0">
                  {isLast ? null : <span aria-hidden="true" className="absolute bottom-1 left-[13.5px] top-8 w-px bg-line" />}
                  <span aria-hidden="true" className={`relative flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ${tone}`}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[14px] font-semibold leading-snug">{item.title}</p>
                      <time dateTime={item.at} title={formatDateTime(item.at)} className="num text-xs text-subtle">
                        {formatTime(item.at)}
                      </time>
                    </div>
                    {item.actor ? <p className="text-[13px] text-muted">{item.actor}</p> : null}
                    {/* Texto puro: o React escapa o conteúdo (sem HTML). */}
                    {item.body ? (
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg rounded-tl-sm border border-warning-line/70 bg-warning-soft/70 px-3.5 py-2.5 text-[14px] leading-relaxed">
                        {item.body}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
