"use server";

import { refresh } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult, FormState } from "@/lib/actions/types";
import { NOTE_MAX_LENGTH, addLeadNote, assignLead, deleteLead, revealLeadCpf, updateLeadStatus, type AssignResult } from "@/lib/admin/leads";
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

const ASSIGN_MESSAGES: Record<Exclude<AssignResult, { ok: true }>["reason"], string> = {
  not_found: "Lead não encontrado ou sem permissão.",
  forbidden: "Sem permissão para atribuir este lead.",
  taken: "Este lead já tem outro responsável. Atualize a página.",
  invalid: "Escolha um membro ativo desta loja.",
};

/**
 * Atribui/reatribui (gerente/KAPA) ou devolve para a fila (assigneeId vazio).
 * As regras ficam na função assign_lead do banco (evento ASSIGNED).
 */
export async function assignLeadAction(id: string, assigneeId: string): Promise<ActionResult> {
  const target = assigneeId === "" ? null : assigneeId;
  if (!leadId.safeParse(id).success || (target !== null && !leadId.safeParse(target).success)) {
    return { ok: false, error: "Dados inválidos." };
  }
  const { db } = await getAdminSession();
  const result = await assignLead(db, id, target);
  if (!result.ok) return { ok: false, error: ASSIGN_MESSAGES[result.reason] };
  refresh();
  return { ok: true };
}

/** SDR assume para si um lead sem responsável. */
export async function claimLeadAction(id: string): Promise<ActionResult> {
  if (!leadId.safeParse(id).success) return { ok: false, error: "Dados inválidos." };
  const { db, context } = await getAdminSession();
  const result = await assignLead(db, id, context.userId);
  if (!result.ok) return { ok: false, error: ASSIGN_MESSAGES[result.reason] };
  refresh();
  return { ok: true };
}

/**
 * CPF completo, só sob demanda. O banco confere o acesso e grava
 * CPF_REVEALED. O valor vai apenas na resposta desta ação — nunca em log,
 * URL ou HTML inicial.
 */
export async function revealCpfAction(id: string): Promise<ActionResult<string>> {
  if (!leadId.safeParse(id).success) return { ok: false, error: "Dados inválidos." };
  const { db } = await getAdminSession();
  const cpf = await revealLeadCpf(db, id);
  if (!cpf) return { ok: false, error: "O CPF só pode ser visto pelo responsável do lead ou pelo gerente." };
  refresh();
  return { ok: true, data: cpf };
}

/**
 * Exclusão definitiva (SUPER_ADMIN ou gerente da loja do lead; regra no
 * banco, delete_lead). Sucesso: volta para /leads substituindo o histórico,
 * para o "voltar" do navegador não reabrir o lead excluído.
 * `releaseCpfCooldown`: pedido de eliminação do titular (LGPD) — remove também
 * o bloqueio de CPF; o banco só aceita para SUPER_ADMIN e com `identityVerified`.
 */
export async function deleteLeadAction(id: string, releaseCpfCooldown = false, identityVerified = false): Promise<ActionResult> {
  if (!leadId.safeParse(id).success || typeof releaseCpfCooldown !== "boolean" || typeof identityVerified !== "boolean") {
    return { ok: false, error: "Dados inválidos." };
  }
  const { db } = await getAdminSession();
  let result: Awaited<ReturnType<typeof deleteLead>>;
  try {
    result = await deleteLead(db, id, releaseCpfCooldown, identityVerified);
  } catch {
    return { ok: false, error: "Não foi possível excluir o lead agora. Tente novamente." };
  }
  if (!result.ok) {
    if (result.reason === "invalid") return { ok: false, error: "Confirme que a identidade do titular foi verificada." };
    const forbidden = releaseCpfCooldown ? "Só a KAPA pode liberar o bloqueio de CPF." : "Só o gerente da loja pode excluir leads.";
    return { ok: false, error: result.reason === "forbidden" ? forbidden : "Lead não encontrado ou sem permissão." };
  }
  redirect("/leads?excluido=1", RedirectType.replace);
}
