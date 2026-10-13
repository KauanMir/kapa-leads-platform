import { STATUS_LABELS, isLeadStatus } from "@/lib/format/status";
import type { Json } from "@/types/database";

/**
 * Linha do tempo única do lead (eventos + observações), em ordem cronológica.
 * NOTE_ADDED não aparece separado: a própria observação é o item.
 */

type Person = { full_name: string | null; email: string | null } | null;

export type TimelineEventInput = { id: number; type: string; payload: Json; created_at: string; actor_id: string | null; actor: Person };
export type TimelineNoteInput = { id: string; body: string; created_at: string; author_id: string | null; author: Person };

export type TimelineItem = {
  key: string;
  at: string;
  kind: "created" | "status" | "note" | "assigned" | "audit" | "event";
  title: string;
  body?: string;
  actor: string | null;
};

/**
 * Nome exibido de quem fez a ação. O RLS só deixa ver perfis próprios (ou,
 * para STORE_ADMIN/SUPER_ADMIN, de membros); `names` (equipe da loja, sem
 * e-mail) cobre os colegas. Sem nenhum dos dois, um rótulo neutro.
 */
export function personLabel(id: string | null, person: Person, currentUserId: string, names?: Map<string, string>): string | null {
  if (!id) return null;
  if (id === currentUserId) return "Você";
  return person?.full_name?.trim() || names?.get(id) || person?.email || "Membro da equipe";
}

/** Nome de um usuário citado no payload (ASSIGNED). */
function memberName(id: unknown, currentUserId: string, names?: Map<string, string>): string | null {
  if (typeof id !== "string" || !id) return null;
  if (id === currentUserId) return "você";
  return names?.get(id) ?? "membro da equipe";
}

function assignmentTitle(payload: Record<string, unknown>, actorId: string | null, currentUserId: string, names?: Map<string, string>): string {
  const from = memberName(payload.from, currentUserId, names);
  const to = memberName(payload.to, currentUserId, names);
  if (!to) return "Lead devolvido para a fila (sem responsável)";
  if (!from) return actorId && actorId === payload.to ? `Lead assumido por ${to}` : `Lead atribuído a ${to}`;
  return `Responsável alterado: ${from} → ${to}`;
}

function statusLabel(value: unknown): string {
  return isLeadStatus(value) ? STATUS_LABELS[value] : "—";
}

const EVENT_TITLES: Record<string, string> = {
  WHATSAPP_OPENED: "WhatsApp aberto",
  PHONE_CLICKED: "Ligação iniciada",
  CPF_REVEALED: "CPF visualizado",
};

export function buildTimeline(
  events: TimelineEventInput[],
  notes: TimelineNoteInput[],
  currentUserId: string,
  names?: Map<string, string>,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of events) {
    const actor = personLabel(event.actor_id, event.actor, currentUserId, names);
    if (event.type === "NOTE_ADDED") continue;

    if (event.type === "CREATED") {
      items.push({ key: `e${event.id}`, at: event.created_at, kind: "created", title: "Lead recebido", actor });
    } else if (event.type === "STATUS_CHANGED") {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      items.push({
        key: `e${event.id}`,
        at: event.created_at,
        kind: "status",
        title: `Status alterado: ${statusLabel(payload.from)} → ${statusLabel(payload.to)}`,
        actor,
      });
    } else if (event.type === "ASSIGNED") {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const title = assignmentTitle(payload, event.actor_id, currentUserId, names);
      items.push({ key: `e${event.id}`, at: event.created_at, kind: "assigned", title, actor });
    } else {
      const kind = event.type === "CPF_REVEALED" ? "audit" : "event";
      items.push({ key: `e${event.id}`, at: event.created_at, kind, title: EVENT_TITLES[event.type] ?? "Evento", actor });
    }
  }

  for (const note of notes) {
    items.push({
      key: `n${note.id}`,
      at: note.created_at,
      kind: "note",
      title: "Observação",
      body: note.body,
      actor: personLabel(note.author_id, note.author, currentUserId, names),
    });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}
