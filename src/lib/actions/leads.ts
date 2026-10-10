"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import type { ActionResult, FormState } from "@/lib/actions/types";
import { NOTE_MAX_LENGTH, addLeadNote, updateLeadStatus } from "@/lib/admin/leads";
import { getAdminSession } from "@/lib/auth/session";
import { isLeadStatus } from "@/lib/format/status";

const leadId = z.uuid();

/** Altera o status (RLS: só leads das lojas do usuário). O trigger gera STATUS_CHANGED. */
export async function changeLeadStatus(id: string, status: string): Promise<ActionResult> {
  if (!leadId.safeParse(id).success || !isLeadStatus(status)) return { ok: false, error: "Dados inválidos." };

  const { db } = await getAdminSession();
  const updated = await updateLeadStatus(db, id, status);
  if (!updated) return { ok: false, error: "Lead não encontrado ou sem permissão." };

  refresh();
  return { ok: true };
}

/** Adiciona observação (RLS + trigger definem loja e autor). O trigger gera NOTE_ADDED. */
export async function addNote(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!leadId.safeParse(id).success) return { ok: false, error: "Lead inválido." };

  const body = String(formData.get("body") ?? "");
  if (!body.trim()) return { ok: false, error: "Escreva a observação.", fieldErrors: { body: "Obrigatório" } };
  if (body.trim().length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Máximo de ${NOTE_MAX_LENGTH} caracteres.`, fieldErrors: { body: "Muito longa" } };
  }

  const { db } = await getAdminSession();
  const result = await addLeadNote(db, id, body);
  if (!result.ok) {
    return { ok: false, error: result.reason === "forbidden" ? "Sem permissão para este lead." : "Observação inválida." };
  }

  refresh();
  return { ok: true, message: "Observação adicionada." };
}
