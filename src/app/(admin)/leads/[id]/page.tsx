import { ArrowLeftRight, CalendarClock, CarFront, ClipboardList, History, Lock, Megaphone, Store, UserRound, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { AssigneeCard } from "@/components/leads/assignee-card";
import { CpfReveal } from "@/components/leads/cpf-reveal";
import { DeleteLead } from "@/components/leads/delete-lead";
import { DetailsList } from "@/components/leads/details-list";
import { IllustrativeSimulationCard } from "@/components/leads/illustrative-simulation-card";
import { NoteForm } from "@/components/leads/note-form";
import { PhoneActions } from "@/components/leads/phone-actions";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusSelect } from "@/components/leads/status-select";
import { Timeline } from "@/components/leads/timeline";
import { Avatar } from "@/components/ui/avatar";
import { BackLink, Card, CardHeader } from "@/components/ui/card";
import { getLeadDetail, getLeadHistory } from "@/lib/admin/leads";
import { assignableMembers, getStoreTeam, teamNames } from "@/lib/admin/team";
import { buildTimeline } from "@/lib/admin/timeline";
import { getAdminSession } from "@/lib/auth/session";
import { formatDateTime, formatIsoDate, formatRelative } from "@/lib/format/datetime";
import { formatFormData } from "@/lib/format/form-data";
import { formatIllustrativeAmount } from "@/lib/format/illustrative";
import { buildLeadSummary } from "@/lib/format/lead-summary";
import { formatPhone } from "@/lib/format/phone";
import { buildPresentedSimulation, buildSimulationView, type PresentedSimulation, type SimulationHighlight } from "@/lib/format/simulation";
import { ageOn, todayInSaoPaulo } from "@/lib/validation/birth-date";

export const metadata: Metadata = { title: "Lead · KAPA Leads" };

const HIGHLIGHT_ICONS: Record<SimulationHighlight["key"], typeof CarFront> = { desired: CarFront, downPayment: Wallet, tradeIn: ArrowLeftRight };

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-surface-muted px-2 text-[13px] font-medium text-muted ring-1 ring-inset ring-line [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Valores que a LP mostrou ao cliente no envio (salvos no lead; nada é recalculado aqui). */
function PresentedSimulationBlock({ simulation }: { simulation: PresentedSimulation }) {
  return (
    <section aria-labelledby="presented-simulation" className="overflow-hidden rounded-lg border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-muted px-4 py-2.5">
        <h3 id="presented-simulation" className="text-[13px] font-semibold text-foreground-soft">
          Simulação apresentada
        </h3>
        <p className="text-xs text-muted">Valores mostrados ao cliente no envio</p>
      </div>
      <div className="p-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] font-medium text-muted">Valor estimado a financiar</dt>
            <dd className="num mt-0.5 text-xl font-semibold tracking-tight">{simulation.financed}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-medium text-muted">Taxa de referência</dt>
            <dd className="num mt-0.5 text-xl font-semibold tracking-tight">{simulation.rate}</dd>
          </div>
        </dl>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {simulation.options.map((option) => (
            <li
              key={option.term}
              className={`rounded-lg px-3 py-2.5 ring-1 ring-inset ${option.selected ? "bg-accent-soft ring-accent-line" : "bg-surface ring-line"}`}
            >
              <p className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${option.selected ? "text-accent" : "text-foreground-soft"}`}>{option.label}</span>
                {option.selected ? <span className="text-[11px] font-semibold text-accent">Prazo registrado</span> : null}
              </p>
              <p className="num mt-0.5 text-[15px] font-semibold">
                {option.value}
                <span className="text-sm font-normal text-muted">/mês</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function LeadDetailContent(props: PageProps<"/leads/[id]">) {
  const { db, context } = await getAdminSession();
  const { id } = await props.params;

  // RLS: lead de outra loja simplesmente não é encontrado.
  const lead = await getLeadDetail(db, id);
  if (!lead) return <NotFoundPanel />;

  const [history, team] = await Promise.all([getLeadHistory(db, lead.id), getStoreTeam(db)]);
  const names = teamNames(team);
  const timeline = buildTimeline(history.events, history.notes, context.userId, names);
  // Gerente da loja do lead ou KAPA: atribui/reatribui. SDR: só assume (regra no banco).
  const canManage = context.isSuperAdmin || context.stores.some((s) => s.id === lead.storeId && s.role === "STORE_ADMIN");
  // Mesma regra do banco (private.can_work_lead): SDR só trabalha o lead atribuído a ele.
  // A tela só esconde as ações; quem barra de fato é o RLS/funções.
  const canWork = canManage || lead.assignedTo === context.userId;
  const assigneeName = lead.assignedTo ? (names.get(lead.assignedTo) ?? "outro membro da equipe") : null;
  const lockedMessage = lead.assignedTo
    ? `Este lead está sendo atendido por ${assigneeName}.`
    : "Assuma o lead para chamar no WhatsApp, alterar o status, registrar observações e ver o CPF.";
  const assigneeOptions = assignableMembers(team, lead.storeId).map((m) => ({
    id: m.userId,
    label: m.role === "STORE_ADMIN" ? `${m.fullName} (gerente)` : m.fullName,
  }));
  const summary = buildLeadSummary({
    fullName: lead.fullName,
    phone: lead.phone,
    campaignName: lead.campaignName,
    formData: lead.formData,
    formSchema: lead.formSchema,
  });
  const age = ageOn(lead.birthDate, todayInSaoPaulo(new Date()));
  const simulation = buildSimulationView(lead.formData, lead.formSchema);
  // Só leads enviados com o snapshot (sem snapshot: sem bloco, nada é inventado).
  const presented = buildPresentedSimulation(lead.formData);
  const showStore = context.isSuperAdmin || context.stores.length > 1;
  const t = lead.tracking;
  const origin = [t.utmSource, t.utmMedium, t.utmCampaign].filter(Boolean).join(" · ");

  return (
    <>
      <BackLink href="/leads">Leads</BackLink>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="@container flex min-w-0 flex-col gap-5">
          {/* 1–2. Quem é, telefone e ações; depois status e responsável. */}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-5 p-5 sm:p-6 @3xl:flex-row @3xl:items-start @3xl:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <Avatar name={lead.fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="break-words text-[22px] font-semibold leading-tight tracking-tight sm:text-[28px] sm:leading-9">{lead.fullName}</h1>
                  <p className="num mt-0.5 text-lg font-semibold tracking-tight text-foreground-soft sm:text-xl">{formatPhone(lead.phone)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lead.campaignName ? <Chip icon={<Megaphone />}>{lead.campaignName}</Chip> : null}
                    {showStore && lead.storeName ? <Chip icon={<Store />}>{lead.storeName}</Chip> : null}
                    <Chip icon={<CalendarClock />}>
                      <time dateTime={lead.createdAt} title={formatDateTime(lead.createdAt)}>
                        Recebido {formatRelative(lead.createdAt, new Date())}
                      </time>
                    </Chip>
                  </div>
                </div>
              </div>

              <div className="@3xl:shrink-0">
                {canWork ? (
                  <PhoneActions phone={lead.phone} leadName={lead.fullName} storeName={lead.storeName} summary={summary} />
                ) : (
                  <p role="note" className="flex max-w-md items-start gap-3 rounded-lg border border-line bg-surface-muted px-4 py-3 text-[14px] font-medium">
                    <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                    {lockedMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-line bg-surface-muted/70 px-5 py-4 sm:grid-cols-2 sm:px-6">
              {canWork ? (
                <StatusSelect leadId={lead.id} status={lead.status} />
              ) : (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-muted">Status</p>
                  <div className="flex h-11 items-center">
                    <StatusBadge status={lead.status} size="lg" />
                  </div>
                </div>
              )}
              <AssigneeCard
                leadId={lead.id}
                assignedTo={lead.assignedTo}
                assigneeName={assigneeName}
                currentUserId={context.userId}
                canManage={canManage}
                options={assigneeOptions}
              />
            </div>
          </Card>

          {/* 3. Simulação ilustrativa (Fábrica de Aprovação): valor mostrado ao cliente, validade e respostas.
              Substitui o bloco genérico "Simulação" para não repetir as respostas. */}
          {lead.illustrative ? (
            <IllustrativeSimulationCard
              campaignName={lead.campaignName}
              clientName={lead.fullName}
              amount={formatIllustrativeAmount(lead.illustrative)}
              requestedAt={lead.illustrative.presentedAt}
              requestedAtLabel={formatDateTime(lead.illustrative.presentedAt)}
              expiresAt={lead.illustrative.expiresAt}
              serverNow={new Date().toISOString()}
              answers={formatFormData(lead.formData, lead.formSchema)}
            />
          ) : (
            /* Simulação: os números que o vendedor procura primeiro. */
            <Card>
              <CardHeader icon={<ClipboardList />} title="Simulação" />
              <div className="p-4 sm:p-5">
                {simulation.highlights.length > 0 ? (
                  <dl className="grid grid-cols-1 gap-3 @lg:grid-cols-3">
                    {simulation.highlights.map((item) => {
                      const Icon = HIGHLIGHT_ICONS[item.key];
                      const featured = item.key === "desired";
                      return (
                        <div
                          key={item.key}
                          className={`rounded-lg p-4 ring-1 ring-inset ${featured ? "bg-accent-soft ring-accent-line" : "bg-surface-muted ring-line"}`}
                        >
                          <dt className={`flex items-center gap-1.5 text-[13px] font-medium ${featured ? "text-accent" : "text-muted"}`}>
                            <Icon aria-hidden="true" className="size-3.5" />
                            {item.label}
                          </dt>
                          <dd className={`num mt-1.5 break-words text-xl font-semibold tracking-tight ${item.positive ? "" : "text-muted"}`}>{item.value}</dd>
                          {item.detail ? <dd className="text-sm text-muted">{item.detail}</dd> : null}
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
                {presented ? (
                  <div className={simulation.highlights.length > 0 ? "mt-4" : ""}>
                    <PresentedSimulationBlock simulation={presented} />
                  </div>
                ) : null}
                {simulation.others.length > 0 ? (
                  <div className={simulation.highlights.length > 0 || presented ? "mt-5" : ""}>
                    <DetailsList items={simulation.others.map((entry) => ({ key: entry.key, label: entry.label, value: entry.value }))} />
                  </div>
                ) : null}
                {simulation.highlights.length === 0 && simulation.others.length === 0 && !presented ? (
                  <p className="text-sm text-muted">Nenhuma informação.</p>
                ) : null}
              </div>
            </Card>
          )}

          {/* 4–5. Dados pessoais e origem do lead. */}
          <div className="grid grid-cols-1 items-start gap-5 @2xl:grid-cols-2">
            <Card>
              <CardHeader icon={<UserRound />} title="Dados pessoais" />
              <div className="p-4 sm:p-5">
                <DetailsList
                  items={[
                    { label: "CPF", value: canWork ? <CpfReveal leadId={lead.id} masked={lead.cpfMasked} /> : lead.cpfMasked },
                    { label: "Nascimento", value: `${formatIsoDate(lead.birthDate)} · ${age} anos` },
                    { label: "E-mail", value: lead.email },
                  ]}
                />
              </div>
            </Card>

            <Card>
              <CardHeader icon={<Megaphone />} title="Campanha e origem" />
              <div className="p-4 sm:p-5">
                <DetailsList
                  items={[
                    { label: "Campanha", value: lead.campaignName },
                    { label: "Loja", value: lead.storeName },
                    { label: "Recebido em", value: formatDateTime(lead.createdAt) },
                    { label: "Origem", value: origin },
                    { label: "Consentimento", value: `Aceito em ${formatDateTime(lead.consentAt)}` },
                  ]}
                />
              </div>
            </Card>
          </div>
        </div>

        {/* 6. Histórico e observações (coluna lateral em telas largas). */}
        <aside aria-label="Histórico do lead" className="min-w-0 xl:sticky xl:top-6">
          <Card>
            <CardHeader icon={<History />} title="Histórico" description="Observações e alterações do lead" />
            <div className="flex flex-col gap-6 p-4 sm:p-5">
              {canWork ? <NoteForm leadId={lead.id} /> : null}
              <Timeline items={timeline} />
            </div>
          </Card>
        </aside>
      </div>

      {/* 7. Ação administrativa e destrutiva, longe das ações do dia a dia. Quem barra de fato é o banco (delete_lead). */}
      {canManage ? (
        <section aria-label="Exclusão do lead" className="mt-10 flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Lead incorreto, duplicado, spam ou teste? A exclusão é permanente.</p>
          <DeleteLead leadId={lead.id} cpfCooldownDays={lead.cpfCooldownBusinessDays} canReleaseCpfCooldown={context.isSuperAdmin} />
        </section>
      ) : null}
    </>
  );
}

export default function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <LeadDetailContent {...props} />
    </Suspense>
  );
}
