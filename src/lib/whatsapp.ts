/** Monta o link do WhatsApp (wa.me) a partir de um telefone brasileiro. Retorna null se o número não for válido. */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
