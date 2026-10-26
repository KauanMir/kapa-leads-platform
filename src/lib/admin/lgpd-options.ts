/** Motivos e canais dos pedidos LGPD sobre o bloqueio de CPF (mesmos valores das CHECKs do banco). */

export const LGPD_REASONS = ["ELIMINACAO", "OPOSICAO", "USO_INDEVIDO_TERCEIRO"] as const;
export type LgpdReason = (typeof LGPD_REASONS)[number];

export const LGPD_REASON_LABELS: Record<LgpdReason, string> = {
  ELIMINACAO: "Eliminação dos dados (art. 18, VI)",
  OPOSICAO: "Oposição ao tratamento (art. 18, § 2º)",
  USO_INDEVIDO_TERCEIRO: "CPF usado por outra pessoa",
};

export const LGPD_CHANNEL_LABELS: Record<string, string> = {
  PAINEL_LGPD: "Pedidos LGPD",
  EXCLUSAO_LEAD: "Exclusão do lead",
};
