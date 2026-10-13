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

describe("atribuição e CPF na linha do tempo", () => {
  const names = new Map([["ana", "Ana SDR"], ["bia", "Bia SDR"], ["ger", "Gerente"]]);
  const ev = (id: number, type: string, payload: Record<string, string | null>, actor: string | null) =>
    ({ id, type, payload, created_at: `2026-10-10T13:0${id}:00Z`, actor_id: actor, actor: null });

  it("atribuído, assumido, reatribuído, devolvido e CPF visualizado — com nomes da equipe", () => {
    const items = buildTimeline(
      [
        ev(1, "ASSIGNED", { from: null, to: "ana" }, "ger"),
        ev(2, "ASSIGNED", { from: "ana", to: "bia" }, "ger"),
        ev(3, "ASSIGNED", { from: "bia", to: null }, "ger"),
        ev(4, "ASSIGNED", { from: null, to: ME }, ME),
        ev(5, "CPF_REVEALED", {}, "ana"),
      ],
      [],
      ME,
      names,
    );
    expect(items.map((i) => [i.kind, i.title, i.actor])).toEqual([
      ["assigned", "Lead atribuído a Ana SDR", "Gerente"],
      ["assigned", "Responsável alterado: Ana SDR → Bia SDR", "Gerente"],
      ["assigned", "Lead devolvido para a fila (sem responsável)", "Gerente"],
      ["assigned", "Lead assumido por você", "Você"],
      ["audit", "CPF visualizado", "Ana SDR"],
    ]);
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
