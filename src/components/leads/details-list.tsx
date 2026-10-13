import type { ReactNode } from "react";

/** Lista de rótulo/valor em linhas. Itens sem valor são omitidos (sem "null" na tela). */
export function DetailsList({ items }: { items: Array<{ label: string; value: ReactNode | null | undefined; key?: string }> }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (visible.length === 0) return <p className="text-sm text-muted">Nenhuma informação.</p>;

  return (
    <dl className="divide-y divide-line">
      {visible.map((item) => (
        <div key={item.key ?? item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-[15px] font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
