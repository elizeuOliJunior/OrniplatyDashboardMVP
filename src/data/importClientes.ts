import * as XLSX from 'xlsx';
import { TODAY_ISO } from './agendaStore';
import { allClientsWithPhones, clientWithPhone, createClient, isValidEmail } from './api/clientes';
import { resolveService } from './catalogo';
import { formatPhone } from './equipeFuncionamento';

/**
 * G4 (F-065): importação de clientes por planilha DE VERDADE (mesma biblioteca do Onboarding, `xlsx`).
 * 1. Lê .csv ou .xlsx de até 5 MB (`readSpreadsheet`).
 * 2. Acha as colunas pelo cabeçalho (nome e telefone obrigatórios; e-mail, última visita e serviço opcionais).
 * 3. Confere cada linha (`reviewRows`) e separa aceitas e recusadas, com o motivo.
 * 4. Grava SÓ as aceitas no cadastro único (`data/api/clientes.ts`, `createClient`). Telefone que já está no cadastro não vira
 *    outro cliente (identidade pelo telefone). Nada vira histórico de atendimento, recebimento, consentimento nem origem da IA:
 *    a última visita e o serviço da planilha são conferidos e mostrados, mas não gravados como atendimento.
 * Os números do resumo vêm desta conferência (nunca escritos à mão).
 */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type ImportColumns = {name: number;phone: number;email: number;lastVisit: number;service: number;};
export type ImportRow = {line: number;name: string;phone: string;email: string;lastVisit: string;service: string;note?: string;};
export type RejectedRow = ImportRow & {reason: string;};
export type ImportReview = {fileName: string;accepted: ImportRow[];rejected: RejectedRow[];columns: ImportColumns;header: string[];};

const plain = (v: string) =>
v.
trim().
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '').
replace(/[^a-z0-9 ]+/g, ' ').
replace(/\s+/g, ' ').
trim();

const ALIASES: Record<keyof ImportColumns, string[]> = {
  name: ['nome', 'nome completo', 'cliente', 'nome do cliente', 'name'],
  phone: ['telefone', 'telefone whatsapp', 'whatsapp', 'celular', 'fone', 'telefone celular', 'phone'],
  email: ['email', 'e mail'],
  lastVisit: ['ultima visita', 'data da ultima visita', 'ultimo atendimento', 'data'],
  service: ['servico', 'ultimo servico', 'procedimento', 'servico realizado']
};

/** Modelo de planilha (o mesmo baixado por "Baixar modelo"): 3 linhas válidas, que viram 3 clientes. */
export function templateRows(exampleService: string): string[][] {
  return [
  ['Nome', 'Telefone (WhatsApp)', 'E-mail', 'Última visita', 'Serviço'],
  ['Lívia Castro', '(19) 97101-2201', 'livia.castro@email.com', '15/08/2026', exampleService],
  ['Marcos Teixeira', '(19) 97101-2202', '', '02/09/2026', exampleService],
  ['Sofia Nunes', '(19) 97101-2203', 'sofia.nunes@email.com', '', '']];

}

/** Lê a planilha. Erros de arquivo voltam como `Error` com a frase para a tela. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Escolha um arquivo .csv ou .xlsx.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('O arquivo passa de 5 MB. Divida a planilha e importe em partes.');
  const isCsv = /\.csv$/i.test(file.name);
  const book = isCsv ? XLSX.read(await file.text(), { type: 'string', raw: true }) : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('Não encontramos nenhuma aba com dados na planilha.');
  const rows = XLSX.utils.
  sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }).
  map((r) => (r as unknown[]).map((v) => String(v ?? ''))).
  filter((r) => r.some((v) => v.trim()));
  if (rows.length < 2) throw new Error('A planilha precisa do cabeçalho e de ao menos um cliente.');
  if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error(`Envie até ${MAX_IMPORT_ROWS.toLocaleString('pt-BR')} clientes por planilha.`);
  return rows;
}

/** Acha as colunas pelo cabeçalho; nome e telefone são obrigatórios. */
export function detectColumns(header: string[]): ImportColumns | null {
  const h = header.map(plain);
  const find = (k: keyof ImportColumns) => h.findIndex((x) => ALIASES[k].includes(x));
  const cols = { name: find('name'), phone: find('phone'), email: find('email'), lastVisit: find('lastVisit'), service: find('service') };
  return cols.name < 0 || cols.phone < 0 ? null : cols;
}

/** "19987776655" ou "+55 (19) 98777-6655" → "19987776655"; vazio se não der 10 ou 11 dígitos. */
export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : '';
}

/** "15/08/2026", "2026-08-15" ou número de data do Excel → "2026-08-15"; null = inválida. */
export function parseVisitDate(raw: string): string | null {
  const t = raw.trim();
  let y = 0,m = 0,d = 0;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (br) [d, m, y] = [Number(br[1]), Number(br[2]), Number(br[3])];else
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];else
  if (/^\d{5}$/.test(t)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Confere as linhas. `existingPhones` = telefones (só dígitos) do cadastro atual. */
export function reviewRows(fileName: string, rows: string[][], existingPhones: Set<string> = new Set(allClientsWithPhones().map((c) => c.phone.replace(/\D/g, '')))): ImportReview | {error: string;} {
  const header = rows[0];
  const columns = detectColumns(header);
  if (!columns) return { error: 'A planilha precisa das colunas “Nome” e “Telefone (WhatsApp)”. Baixe o modelo para ver o formato.' };
  const cell = (r: string[], i: number) => i >= 0 ? (r[i] ?? '').trim() : '';
  const seen = new Set<string>();
  const accepted: ImportRow[] = [];
  const rejected: RejectedRow[] = [];
  rows.slice(1).forEach((r, idx) => {
    const row: ImportRow = { line: idx + 2, name: cell(r, columns.name), phone: cell(r, columns.phone), email: cell(r, columns.email), lastVisit: cell(r, columns.lastVisit), service: cell(r, columns.service) };
    const phone = normalizePhone(row.phone);
    let reason = '';
    if (!row.name) reason = 'Sem nome';else
    if (!phone) reason = 'Telefone inválido (use DDD + número)';else
    if (seen.has(phone)) reason = 'Telefone repetido na planilha';
    // W5 (G13): o mesmo WhatsApp não entra em dois cadastros; a linha diz de quem é o número.
    else if (existingPhones.has(phone)) reason = `Este WhatsApp já é de ${clientWithPhone(phone)?.name ?? 'um cliente do cadastro'} (não importado)`;else
    if (row.email && !isValidEmail(row.email)) reason = 'E-mail inválido';else
    if (row.lastVisit) {
      const iso = parseVisitDate(row.lastVisit);
      if (!iso) reason = 'Data da última visita inválida (use dd/mm/aaaa)';else
      if (iso > TODAY_ISO) reason = 'Data da última visita no futuro';
    }
    if (reason) {
      rejected.push({ ...row, reason });
      return;
    }
    seen.add(phone);
    const svc = row.service ? resolveService(row.service) : null;
    accepted.push({ ...row, phone: formatPhone(phone), note: svc && svc.status !== 'active' ? 'serviço fora do catálogo ativo' : undefined });
  });
  return { fileName, accepted, rejected, columns, header };
}

/** Grava as linhas aceitas no cadastro único. Devolve os ids criados (um por linha). */
export function importAccepted(rows: ImportRow[]): string[] {
  // W5 (G11): "Primeiro contato por: Importação de planilha" no cartão do cliente.
  return rows.map((r) => createClient({ name: r.name, phone: r.phone, consent_source: 'importacao', ...(r.email ? { email: r.email } : {}) }));
}