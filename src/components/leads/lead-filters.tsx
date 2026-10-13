"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { filtersToQuery, isAssigneeFilter, type AssigneeFilter, type UrlFilters } from "@/lib/admin/filters";
import { looksLikeCpf } from "@/lib/admin/search";
import { PERIOD_LABELS, PERIODS, type Period } from "@/lib/format/period";
import { LEAD_STATUSES, STATUS_LABELS, isLeadStatus } from "@/lib/format/status";

type Option = { id: string; label: string };

/**
 * Filtros mantidos na URL. A busca recusa CPF antes de navegar, para que
 * ele nunca vá para a query string.
 */
export function LeadFilters({
  basePath,
  current,
  defaultPeriod,
  campaigns,
  stores,
  assignee,
  showSearch = true,
  showStatus = true,
}: {
  basePath: string;
  current: UrlFilters;
  defaultPeriod: Period;
  campaigns: Option[];
  stores: Option[] | null;
  /** Filtro de responsável: `members` só para gerente/KAPA (null = SDR, escolhe pelas abas). */
  assignee?: { defaultValue: AssigneeFilter; members: Option[] | null };
  showSearch?: boolean;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(current.period);
  const [searchError, setSearchError] = useState<string | null>(null);
  // No celular, só a busca fica visível; os demais filtros abrem sob demanda.
  const activeCount = [
    current.status,
    current.campaignId,
    current.storeId,
    current.period !== defaultPeriod,
    assignee?.members && current.assignee !== assignee.defaultValue,
  ].filter(Boolean).length;
  const [showMore, setShowMore] = useState(activeCount > 0 || !showSearch);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get("q") ?? "").trim();
    if (q && looksLikeCpf(q)) {
      setSearchError("A busca por CPF não é permitida. Busque pelo nome ou telefone.");
      return;
    }
    setSearchError(null);

    const status = String(data.get("status") ?? "");
    const resp = String(data.get("resp") ?? "");
    const query = filtersToQuery(
      {
        q,
        status: isLeadStatus(status) ? status : null,
        campaignId: String(data.get("campanha") ?? "") || null,
        storeId: String(data.get("loja") ?? "") || null,
        assignee: assignee && isAssigneeFilter(resp) ? resp : undefined,
        period,
        from: String(data.get("de") ?? ""),
        to: String(data.get("ate") ?? ""),
        page: 1,
      },
      defaultPeriod,
      assignee?.defaultValue,
    );
    router.push(`${basePath}${query}`);
  }

  const selectClass = "h-10 pl-2.5 text-sm sm:w-auto sm:min-w-40 sm:pl-3";

  return (
    <form onSubmit={onSubmit} role="search" aria-label="Filtros de leads" className="rounded-2xl border border-line bg-surface p-3 shadow-card">
      <div className="flex flex-col gap-3">
        {showSearch ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Label htmlFor="filtro-q" className="sr-only">
                Buscar
              </Label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-5 size-4 -translate-y-1/2 text-muted" />
              <Input
                id="filtro-q"
                name="q"
                defaultValue={current.q}
                placeholder="Buscar por nome ou telefone"
                autoComplete="off"
                className="pl-9"
                aria-invalid={searchError ? true : undefined}
                aria-describedby={searchError ? "filtro-q-erro" : undefined}
              />
              <FieldError id="filtro-q-erro">{searchError}</FieldError>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowMore((value) => !value)}
              aria-expanded={showMore}
              aria-controls="mais-filtros"
              className="shrink-0 sm:hidden"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filtros{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </div>
        ) : null}

        <div id="mais-filtros" className={`${showMore ? "grid" : "hidden"} grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center`}>
          {showStatus ? (
            <div>
              <Label htmlFor="filtro-status" className="sr-only">
                Status
              </Label>
              <Select id="filtro-status" name="status" defaultValue={current.status ?? ""} className={selectClass}>
                <option value="">Todos os status</option>
                {LEAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {assignee?.members ? (
            <div>
              <Label htmlFor="filtro-resp" className="sr-only">
                Responsável
              </Label>
              <Select id="filtro-resp" name="resp" defaultValue={current.assignee} className={selectClass}>
                <option value="todos">Todos os responsáveis</option>
                <option value="sem">Sem responsável</option>
                <option value="meus">Meus leads</option>
                {assignee.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : assignee ? (
            <input type="hidden" name="resp" value={current.assignee} />
          ) : null}

          <div>
            <Label htmlFor="filtro-campanha" className="sr-only">
              Campanha
            </Label>
            <Select id="filtro-campanha" name="campanha" defaultValue={current.campaignId ?? ""} className={selectClass}>
              <option value="">Todas as campanhas</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.label}
                </option>
              ))}
            </Select>
          </div>

          {stores ? (
            <div>
              <Label htmlFor="filtro-loja" className="sr-only">
                Loja
              </Label>
              <Select id="filtro-loja" name="loja" defaultValue={current.storeId ?? ""} className={selectClass}>
                <option value="">Todas as lojas</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <Label htmlFor="filtro-periodo" className="sr-only">
              Período
            </Label>
            <Select id="filtro-periodo" name="periodo" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className={selectClass}>
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {PERIOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          {period === "personalizado" ? (
            <>
              <div>
                <Label htmlFor="filtro-de" className="sr-only">
                  De
                </Label>
                <Input id="filtro-de" name="de" type="date" defaultValue={current.from} title="De" className="sm:w-auto" />
              </div>
              <div>
                <Label htmlFor="filtro-ate" className="sr-only">
                  Até
                </Label>
                <Input id="filtro-ate" name="ate" type="date" defaultValue={current.to} title="Até" className="sm:w-auto" />
              </div>
            </>
          ) : null}

          <div className="col-span-2 flex gap-2">
            <Button type="submit" className="flex-1 sm:flex-none">
              Filtrar
            </Button>
            {activeCount || current.q ? (
              <Link href={basePath} className={buttonClasses({ variant: "ghost", className: "flex-1 text-muted sm:flex-none" })}>
                Limpar
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
