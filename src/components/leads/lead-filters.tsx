"use client";

import { Search } from "lucide-react";
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
  const hasActiveFilters = Boolean(
    current.status || current.campaignId || current.storeId || current.period !== defaultPeriod || (assignee?.members && current.assignee !== assignee.defaultValue),
  );
  const [showMore, setShowMore] = useState(hasActiveFilters || !showSearch);

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

  return (
    <form onSubmit={onSubmit} role="search" aria-label="Filtros de leads" className="rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showSearch ? (
          <div className="sm:col-span-2">
            <Label htmlFor="filtro-q">Buscar</Label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input
                id="filtro-q"
                name="q"
                defaultValue={current.q}
                placeholder="Nome ou telefone"
                autoComplete="off"
                className="pl-9"
                aria-invalid={searchError ? true : undefined}
                aria-describedby={searchError ? "filtro-q-erro" : undefined}
              />
            </div>
            <FieldError id="filtro-q-erro">{searchError}</FieldError>
          </div>
        ) : null}

        <div id="mais-filtros" className={showMore ? "contents" : "hidden sm:contents"}>
        {showStatus ? (
          <div>
            <Label htmlFor="filtro-status">Status</Label>
            <Select id="filtro-status" name="status" defaultValue={current.status ?? ""}>
              <option value="">Todos</option>
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
            <Label htmlFor="filtro-resp">Responsável</Label>
            <Select id="filtro-resp" name="resp" defaultValue={current.assignee}>
              <option value="todos">Todos</option>
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
          <Label htmlFor="filtro-campanha">Campanha</Label>
          <Select id="filtro-campanha" name="campanha" defaultValue={current.campaignId ?? ""}>
            <option value="">Todas</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.label}
              </option>
            ))}
          </Select>
        </div>

        {stores ? (
          <div>
            <Label htmlFor="filtro-loja">Loja</Label>
            <Select id="filtro-loja" name="loja" defaultValue={current.storeId ?? ""}>
              <option value="">Todas</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div>
          <Label htmlFor="filtro-periodo">Período</Label>
          <Select id="filtro-periodo" name="periodo" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
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
              <Label htmlFor="filtro-de">De</Label>
              <Input id="filtro-de" name="de" type="date" defaultValue={current.from} />
            </div>
            <div>
              <Label htmlFor="filtro-ate">Até</Label>
              <Input id="filtro-ate" name="ate" type="date" defaultValue={current.to} />
            </div>
          </>
        ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit">Filtrar</Button>
        {showSearch ? (
          <Button
            variant="secondary"
            onClick={() => setShowMore((value) => !value)}
            aria-expanded={showMore}
            aria-controls="mais-filtros"
            className="sm:hidden"
          >
            {showMore ? "Menos filtros" : "Mais filtros"}
          </Button>
        ) : null}
        <Link href={basePath} className={buttonClasses({ variant: "ghost" })}>
          Limpar filtros
        </Link>
      </div>
    </form>
  );
}
