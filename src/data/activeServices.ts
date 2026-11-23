/**
 * G1 subetapa 4 (F-055): a contagem ÚNICA de serviços ativos (prontidão, Empresa, pagamento, Conhecimento).
 * Módulo sem dependências de propósito: data/paymentRules.ts usa e não pode importar data/servicesStore.ts (ciclo de módulos).
 */
export function activeServicesOf<T extends {active: boolean;}>(list: T[]): T[] {
  return list.filter((s) => s.active);
}