import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { AssigneeCard } from "@/components/leads/assignee-card";
import { CpfReveal } from "@/components/leads/cpf-reveal";
import { DetailsList } from "@/components/leads/details-list";
import { NoteForm } from "@/components/leads/note-form";
import { PhoneActions } from "@/components/leads/phone-actions";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusSelect } from "@/components/leads/status-select";
import { SummaryCopy } from "@/components/leads/summary-copy";
import { Timeline } from "@/components/leads/timeline";
import { Card, CardHeader } from "@/components/ui/card";
import { getLeadDetail, getLeadHistory } from "@/lib/admin/leads";
import { assignableMembers, getStoreTeam, teamNames } from "@/lib/admin/team";
import { buildTimeline } from "@/lib/admin/timeline";
import { getAdminSession } from "@/lib/auth/session";
import { formatDateTime, formatIsoDate } from "@/lib/format/datetime";
import { formatFormData } from "@/lib/format/form-data";
import { buildLeadSummary } from "@/lib/format/lead-summary";
import { formatPhone } from "@/lib/format/phone";
import { ageOn, todayInSaoPaulo } from "@/lib/validation/birth-date";

export const metadata: Metadata = { title: "Lead · KAPA Leads" };

export default async function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;
  const { db, context } = await getAdminSession();

  // RLS: lead de outra loja simplesmente não é encontrado.
  const lead = await getLeadDetail(db, id);
  if (!lead) return <NotFoundPanel />;

  const [history, team] = await Promise.all([getLeadHistory(db, lead.id), getStoreTeam(db)]);
  const names = teamNames(team);
  const timeline = buildTimeline(history.events, history.notes, context.userId, names);
  // Gerente da loja do lead ou KAPA: atribui/reatribui. SDR: só assume (regra no banco).
  const canManage = context.isSuperAdmin || context.stores.some((s) => s.id === lead.storeId && s.role === "STORE_ADMIN");
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
  const formEntries = formatFormData(lead.formData, lead.formSchema);
  const t = lead.tracking;

  return (
    <>
      <Link href="/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para leads
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{lead.fullName}</h1>
          <p className="mt-1 text-muted">
            Recebido em <time dateTime={lead.createdAt}>{formatDateTime(lead.createdAt)}</time>
            {lead.storeName ? <> · {lead.storeName}</> : null}
            {lead.campaignName ? <> · {lead.campaignName}</> : null}
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <Card className="mb-6 p-5">
        <p className="mb-3 text-sm text-muted">
          Telefone <span className="font-semibold tabular-nums text-foreground">{formatPhone(lead.phone)}</span>
        </p>
        <PhoneActions phone={lead.phone} leadName={lead.fullName} storeName={lead.storeName} />
        <div className="mt-4 border-t border-line pt-4">
          <SummaryCopy summary={summary} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Card>
            <CardHeader title="Dados pessoais" />
            <div className="p-5">
              <DetailsList
                items={[
                  { label: "Nome", value: lead.fullName },
                  { label: "CPF", value: <CpfReveal leadId={lead.id} masked={lead.cpfMasked} /> },
                  { label: "Nascimento", value: `${formatIsoDate(lead.birthDate)} (${age} anos)` },
                  { label: "Telefone", value: formatPhone(lead.phone) },
                  { label: "E-mail", value: lead.email },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Dados do formulário" description={lead.campaignName ?? undefined} />
            <div className="p-5">
              <DetailsList items={formEntries.map((entry) => ({ key: entry.key, label: entry.label, value: entry.value }))} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Campanha e origem" />
            <div className="p-5">
              <DetailsList
                items={[
                  { label: "Loja", value: lead.storeName },
                  { label: "Campanha", value: lead.campaignName },
                  { label: "Data de cadastro", value: formatDateTime(lead.createdAt) },
                  { label: "Consentimento", value: `Versão ${lead.consentVersion} · ${formatDateTime(lead.consentAt)}` },
                  { label: "utm_source", value: t.utmSource },
                  { label: "utm_medium", value: t.utmMedium },
                  { label: "utm_campaign", value: t.utmCampaign },
                  { label: "utm_content", value: t.utmContent },
                  { label: "utm_term", value: t.utmTerm },
                  { label: "Página", value: t.pageUrl },
                  { label: "Referência", value: t.referrer },
                ]}
              />
            </div>
          </Card>
        </div>

        {/* No celular, responsável, status e histórico (ações do SDR) vêm antes dos dados. */}
        <div className="order-first flex flex-col gap-6 lg:order-none lg:col-span-2">
          <Card className="flex flex-col gap-5 p-5">
            <AssigneeCard
              leadId={lead.id}
              assignedTo={lead.assignedTo}
              assigneeName={lead.assignedTo ? (names.get(lead.assignedTo) ?? null) : null}
              currentUserId={context.userId}
              canManage={canManage}
              options={assigneeOptions}
            />
            <StatusSelect leadId={lead.id} status={lead.status} />
          </Card>

          <Card>
            <CardHeader title="Histórico" />
            <div className="flex flex-col gap-6 p-5">
              <NoteForm leadId={lead.id} />
              <Timeline items={timeline} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
