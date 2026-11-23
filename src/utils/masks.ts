/**
 * L22 (17/11/2026, pedido do Christian): máscaras de telefone e CPF ao digitar, em todo campo de telefone e CPF do Painel.
 * UM helper só, usado por todos os campos. Sem validação de CPF verdadeiro (seria regra nova).
 * - Telefone: (DD) 99999-9999 com 11 dígitos (celular); (DD) 9999-9999 com 10 (fixo). Enquanto digita, até 10 dígitos
 *   aparece no formato do fixo e passa para o do celular no 11º dígito. Nada passa de 11 dígitos.
 * - Colar: um número colado com +55 na frente (mais de 11 dígitos começando por 55) perde o 55 e é formatado.
 * - CPF: 000.000.000-00, nada passa de 11 dígitos.
 * Sem `maxLength` nos campos de propósito: o navegador cortaria um número colado com "+55" antes da máscara.
 * O que cada tela guarda não muda: quem guardava texto formatado continua guardando formatado; quem guardava só os
 * dígitos (profissional) continua guardando só os dígitos (`phoneDigits`). No sistema real: guardar só os números.
 */
export const onlyDigits = (v: string) => (v ?? '').replace(/\D/g, '');

/** Só os dígitos do telefone (máx. 11), sem o 55 do país quando colado com ele. */
export function phoneDigits(v: string) {
  let d = onlyDigits(v);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 11);
}

/** (19) 99641-3378 · (19) 3215-4400, enquanto digita. */
export function maskPhoneBR(v: string) {
  const d = phoneDigits(v);
  if (!d.length) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 000.000.000-00, enquanto digita. */
export function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}