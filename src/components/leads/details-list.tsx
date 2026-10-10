import type { ReactNode } from "react";

/** Lista de rótulo/valor. Itens sem valor são omitidos (sem "null" na tela). */
export function DetailsList({ items }: { items: Array<{ label: string; value: ReactNode | null | undefined; key?: string }> }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  if (visible.length === 0) return <p className="text-sm text-muted">Nenhuma informação.</p>;

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {visible.map((item) => (
        <div key={item.key ?? item.label} className="min-w-0">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="break-words font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
