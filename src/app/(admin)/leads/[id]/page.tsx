import { ArrowLeft, ArrowLeftRight, CalendarClock, CarFront, ClipboardList, History, Lock, Megaphone, Store, UserRound, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { AssigneeCard } from "@/components/leads/assignee-card";
import { CpfReveal } from "@/components/leads/cpf-reveal";
import { DetailsList } from "@/components/leads/details-list";
import { NoteForm } from "@/components/leads/note-form";
import { PhoneActions } from "@/components/leads/phone-actions";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusSelect } from "@/components/leads/status-select";
import { Timeline } from "@/components/leads/timeline";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { getLeadDetail, getLeadHistory } from "@/lib/admin/leads";
import { assignableMembers, getStoreTeam, teamNames } from "@/lib/admin/team";
import { buildTimeline } from "@/lib/admin/timeline";
import { getAdminSession } from "@/lib/auth/session";
import { formatDateTime, formatIsoDate, formatRelative } from "@/lib/format/datetime";
import { buildLeadSummary } from "@/lib/format/lead-summary";
import { formatPhone } from "@/lib/format/phone";
import { buildSimulationView, type SimulationHighlight } from "@/lib/format/simulation";
import { ageOn, todayInSaoPaulo } from "@/lib/validation/birth-date";

export const metadata: Metadata = { title: "Lead · KAPA Leads" };

const HIGHLIGHT_ICONS: Record<SimulationHighlight["key"], typeof CarFront> = { desired: CarFront, downPayment: Wallet, tradeIn: ArrowLeftRight };

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[13px] font-medium text-muted ring-1 ring-inset ring-line [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="truncate">{children}</span>
    </span>
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
  const showStore = context.isSuperAdmin || context.stores.length > 1;
  const t = lead.tracking;
  const origin = [t.utmSource, t.utmMedium, t.utmCampaign].filter(Boolean).join(" · ");

  return (
    <>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Leads
      </Link>

      {/* Topo: quem é, telefone, ações, status e responsável. */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4 sm:gap-5">
            <Avatar name={lead.fullName} size="lg" className="sm:size-16 sm:text-xl" />
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-bold leading-tight tracking-tight sm:text-[32px] sm:leading-10">{lead.fullName}</h1>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground/90 sm:text-2xl">{formatPhone(lead.phone)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
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

          <div className="mt-6">
            {canWork ? (
              <PhoneActions phone={lead.phone} leadName={lead.fullName} storeName={lead.storeName} summary={summary} />
            ) : (
              <p role="note" className="flex items-start gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3 font-medium">
                <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                {lockedMessage}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-line bg-surface-muted/70 px-5 py-4 sm:grid-cols-2 sm:px-7 sm:py-5">
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          {/* Simulação: os números que o vendedor procura primeiro. */}
          <Card>
            <CardHeader icon={<ClipboardList />} title="Simulação" />
            <div className="p-5">
              {simulation.highlights.length > 0 ? (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {simulation.highlights.map((item) => {
                    const Icon = HIGHLIGHT_ICONS[item.key];
                    const featured = item.key === "desired";
                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl p-4 ring-1 ring-inset ${featured ? "bg-accent-soft ring-accent/15" : "bg-surface-muted ring-line"}`}
                      >
                        <dt className={`flex items-center gap-1.5 text-[13px] font-medium ${featured ? "text-accent" : "text-muted"}`}>
                          <Icon aria-hidden="true" className="size-3.5" />
                          {item.label}
                        </dt>
                        <dd className={`mt-1.5 break-words text-xl font-semibold tracking-tight tabular-nums ${item.positive ? "" : "text-muted"}`}>
                          {item.value}
                        </dd>
                        {item.detail ? <dd className="text-sm text-muted">{item.detail}</dd> : null}
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {simulation.others.length > 0 ? (
                <div className={simulation.highlights.length > 0 ? "mt-5" : ""}>
                  <DetailsList items={simulation.others.map((entry) => ({ key: entry.key, label: entry.label, value: entry.value }))} />
                </div>
              ) : null}
              {simulation.highlights.length === 0 && simulation.others.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma informação.</p>
              ) : null}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<UserRound />} title="Dados pessoais" />
              <div className="p-5">
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
              <div className="p-5">
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

        <div className="lg:col-span-2">
          <Card>
            <CardHeader icon={<History />} title="Histórico" />
            <div className="flex flex-col gap-6 p-5">
              {canWork ? <NoteForm leadId={lead.id} /> : null}
              <Timeline items={timeline} />
            </div>
          </Card>
        </div>
      </div>
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
