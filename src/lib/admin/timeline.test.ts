import { describe, expect, it } from "vitest";

import { buildTimeline, personLabel } from "@/lib/admin/timeline";

const ME = "user-me";

describe("buildTimeline", () => {
  it("une eventos e observações em ordem cronológica", () => {
    const items = buildTimeline(
      [
        { id: 3, type: "NOTE_ADDED", payload: { note_id: "n1" }, created_at: "2026-10-10T13:42:00Z", actor_id: ME, actor: null },
        { id: 1, type: "CREATED", payload: {}, created_at: "2026-10-10T13:32:00Z", actor_id: null, actor: null },
        { id: 2, type: "STATUS_CHANGED", payload: { from: "NEW", to: "CONTACTED" }, created_at: "2026-10-10T13:40:00Z", actor_id: "other", actor: { full_name: "Kauan", email: null } },
      ],
      [{ id: "n1", body: "Cliente pediu retorno às 15h.", created_at: "2026-10-10T13:42:00Z", author_id: ME, author: { full_name: "Eu", email: null } }],
      ME,
    );

    expect(items.map((item) => [item.kind, item.title, item.actor, item.body ?? null])).toEqual([
      ["created", "Lead recebido", null, null],
      ["status", "Status alterado: Novo → Contatado", "Kauan", null],
      ["note", "Observação", "Você", "Cliente pediu retorno às 15h."],
    ]);
  });

  it("status desconhecido no payload não quebra", () => {
    const [item] = buildTimeline(
      [{ id: 1, type: "STATUS_CHANGED", payload: { from: "X", to: null }, created_at: "2026-10-10T13:40:00Z", actor_id: null, actor: null }],
      [],
      ME,
    );
    expect(item.title).toBe("Status alterado: — → —");
  });
});

describe("personLabel", () => {
  it("usa Você, nome, e-mail ou rótulo neutro (perfil não visível pelo RLS)", () => {
    expect(personLabel(null, null, ME)).toBeNull();
    expect(personLabel(ME, null, ME)).toBe("Você");
    expect(personLabel("x", { full_name: " Ana ", email: "a@x.com" }, ME)).toBe("Ana");
    expect(personLabel("x", { full_name: null, email: "a@x.com" }, ME)).toBe("a@x.com");
    expect(personLabel("x", null, ME)).toBe("Membro da equipe");
  });
});
