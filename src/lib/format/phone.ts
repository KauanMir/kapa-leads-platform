/** Telefones são armazenados só com dígitos (DDD + número). */

/** "(11) 98765-4321" / "(11) 3456-7890" */
export function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** Link para discagem: tel:+5511987654321 */
export function telHref(digits: string): string {
  return `tel:+55${digits.replace(/\D/g, "")}`;
}

/** Mensagem inicial sugerida (o vendedor revisa antes de enviar). */
export function whatsappGreeting(leadName: string, storeName: string): string {
  const firstName = leadName.trim().split(/\s+/)[0] ?? "";
  return `Olá, ${firstName}. Aqui é da ${storeName}. Recebemos sua solicitação e estou entrando em contato para dar continuidade ao atendimento.`;
}

/** Abre a conversa no WhatsApp (não envia nada automaticamente). */
export function whatsappUrl(digits: string, message?: string): string {
  const base = `https://wa.me/55${digits.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
