import { describe, expect, it } from "vitest";

import { resolveAccess } from "@/lib/auth/access";

const storeA = { id: "a", name: "Loja A", slug: "loja-a", is_active: true };
const storeB = { id: "b", name: "Loja B", slug: "loja-b", is_active: false };

function profile(overrides: Partial<{ is_super_admin: boolean; is_active: boolean }> = {}) {
  return { id: "user-1", email: "u@example.com", full_name: "Usuário", is_super_admin: false, is_active: true, ...overrides };
}

describe("resolveAccess", () => {
  it("sem perfil → no_profile", () => {
    expect(resolveAccess(null, [], []).status).toBe("no_profile");
  });

  it("perfil inativo → inactive (mesmo sendo SUPER_ADMIN)", () => {
    expect(resolveAccess(profile({ is_active: false }), [{ role: "STORE_USER", is_active: true, store: storeA }], []).status).toBe("inactive");
    expect(resolveAccess(profile({ is_active: false, is_super_admin: true }), [], [storeA]).status).toBe("inactive");
  });

  it("usuário de loja vê somente vínculos ativos", () => {
    const result = resolveAccess(
      profile(),
      [
        { role: "STORE_USER", is_active: true, store: storeA },
        { role: "STORE_ADMIN", is_active: false, store: storeB },
      ],
      [],
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.stores.map((s) => s.id)).toEqual(["a"]);
    expect(result.context.role).toBe("STORE_USER");
    expect(result.context.isSuperAdmin).toBe(false);
  });

  it("sem vínculo ativo → no_store", () => {
    expect(resolveAccess(profile(), [{ role: "STORE_ADMIN", is_active: false, store: storeA }], []).status).toBe("no_store");
    expect(resolveAccess(profile(), [], [storeA]).status).toBe("no_store");
  });

  it("STORE_ADMIN em alguma loja → papel STORE_ADMIN", () => {
    const result = resolveAccess(
      profile(),
      [
        { role: "STORE_USER", is_active: true, store: storeA },
        { role: "STORE_ADMIN", is_active: true, store: storeB },
      ],
      [],
    );
    expect(result.status === "ok" && result.context.role).toBe("STORE_ADMIN");
  });

  it("SUPER_ADMIN vê todas as lojas, mesmo sem vínculo", () => {
    const result = resolveAccess(profile({ is_super_admin: true }), [], [storeB, storeA]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.role).toBe("SUPER_ADMIN");
    expect(result.context.stores.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
