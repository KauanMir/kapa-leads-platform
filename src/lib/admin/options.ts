import type { CampaignRow } from "@/lib/admin/config";
import type { AdminContext } from "@/lib/auth/access";

/** Opções dos selects de filtro (já limitadas pelo RLS/contexto do usuário). */
export function campaignOptions(campaigns: CampaignRow[], withStore: boolean) {
  return campaigns
    .map((campaign) => ({
      id: campaign.id,
      label: withStore && campaign.storeName ? `${campaign.name} · ${campaign.storeName}` : campaign.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function storeOptions(context: AdminContext) {
  return context.stores.map((store) => ({ id: store.id, label: store.isActive ? store.name : `${store.name} (inativa)` }));
}
