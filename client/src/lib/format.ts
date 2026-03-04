/**
 * Formata valor numérico como moeda brasileira (R$ X.XXX,XX)
 */
export function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Formata data para exibição curta (dd/mm)
 */
export function formatDateShort(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Formata data completa (dd/mm/yyyy HH:MM)
 */
export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR");
}
