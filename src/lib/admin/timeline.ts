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
  kind: "created" | "status" | "note" | "event";
  title: string;
  body?: string;
  actor: string | null;
};

/**
 * Nome exibido de quem fez a ação. O RLS só deixa ver perfis próprios (ou,
 * para STORE_ADMIN/SUPER_ADMIN, de membros) — quando o nome não é visível,
 * mostra um rótulo neutro.
 */
export function personLabel(id: string | null, person: Person, currentUserId: string): string | null {
  if (!id) return null;
  if (id === currentUserId) return "Você";
  return person?.full_name?.trim() || person?.email || "Membro da equipe";
}

function statusLabel(value: unknown): string {
  return isLeadStatus(value) ? STATUS_LABELS[value] : "—";
}

const EVENT_TITLES: Record<string, string> = {
  WHATSAPP_OPENED: "WhatsApp aberto",
  PHONE_CLICKED: "Ligação iniciada",
  CPF_REVEALED: "CPF revelado",
  ASSIGNED: "Lead atribuído",
};

export function buildTimeline(
  events: TimelineEventInput[],
  notes: TimelineNoteInput[],
  currentUserId: string,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of events) {
    const actor = personLabel(event.actor_id, event.actor, currentUserId);
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
    } else {
      items.push({ key: `e${event.id}`, at: event.created_at, kind: "event", title: EVENT_TITLES[event.type] ?? "Evento", actor });
    }
  }

  for (const note of notes) {
    items.push({
      key: `n${note.id}`,
      at: note.created_at,
      kind: "note",
      title: "Observação",
      body: note.body,
      actor: personLabel(note.author_id, note.author, currentUserId),
    });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}
