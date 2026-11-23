import { parseBRL } from '../utils/currency';
import { createSavedStore, useSavedStore } from './iaConfigStore';
import { SEGMENT_OPTIONS, businessWords, migrateSegment, segmentContent, segmentWasMigrated, setCurrentSegment } from './segment';
import type { SegmentContent } from './segment';

/**
 * Segmento (4) e especialidade (só Clínica e Consultório): Lote D, 21/10/2026, decisões S1/S1b. Substituem a lista
 * "só clínicas" (C5, 19/10). Opções, conversão de valores antigos e palavras ficam em `data/segment.ts` (compartilhado com o Onboarding).
 * `businessSegments` fica por compatibilidade.
 */
export const businessSegments = SEGMENT_OPTIONS;

export const paymentMethods = [
{ value: 'pix', label: 'Pix' },
{ value: 'credito', label: 'Cartão de crédito' },
{ value: 'debito', label: 'Cartão de débito' },
{ value: 'dinheiro', label: 'Dinheiro' }];


export const UF_OPTIONS = [
'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].
map((uf) => ({ value: uf, label: uf }));

/** Exemplos de convênio FICTÍCIOS (nunca nomes reais de operadoras). */
export const INSURER_SUGGESTIONS = ['Saúde Mais', 'Bem Viver'];

export const DESCRIPTION_EXAMPLE =
'Clínica de estética facial e corporal no Cambuí, com protocolos personalizados e avaliação com a Dra. Carolina.';

export const NO_SHOW_EXAMPLE = 'Faltas sem aviso podem exigir pagamento antecipado no próximo agendamento.';

/** Exemplo acima de "Como o cliente paga" (Lote F, F1.3: junta "Como o cliente paga o sinal" e "Algo mais sobre pagamento"). */
export const HOW_TO_PAY_EXAMPLE = 'Pagamento na recepção, no dia do atendimento. Para o sinal, a equipe manda a chave Pix pelo WhatsApp e confirma.';
export const HOW_TO_PAY_MAX = 300;
export const MAX_CUSTOM_LINKS = 3;

/** Endereço de exemplo devolvido pela busca de CEP (fictício; nenhum serviço externo é chamado). */
export const CEP_EXAMPLE = { street: 'Rua Coronel Quirino', district: 'Cambuí', city: 'Campinas', uf: 'SP' };

/** E5 (D4, Lote E): Instagram, Facebook, site e até 3 links personalizados com nome. */
export type CustomLink = {id: string;label: string;url: string;};
export type ClinicLinks = {instagram: string;facebook: string;site: string;custom: CustomLink[];};

/**
 * Lote F (22/10/2026, decisões P1–P6 do Christian): "padrão da empresa + diferente neste serviço".
 * Aqui fica o PADRÃO (IA Orniplaty › Empresa). A exceção mora no serviço (`ServiceItem.payment`, data/paymentRules.ts).
 * Formas continuam Pix, crédito, débito e dinheiro (P6). Saíram `minInstallment` (P2) e `depositServices` (P3);
 * `depositHow` + `note` viraram `howToPay` (P4). Conversão do formato antigo: `migrateLegacyPayment` (data/paymentRules.ts).
 * BACKEND: hoje só existe `formas_pagamento` (texto de 200 caracteres). Nada disto tem campo próprio.
 */
export type InstallmentRule = {
  installments: 'sim' | 'nao';
  /** Em até quantas vezes (2 a 12). */
  maxInstallments: string;
  /** 'todas' = todas sem juros; 'nenhuma' = todas com juros; '2'..'11' = sem juros até Nx. */
  interestFreeUpTo: string;
};
export type DiscountRule = {
  discount: 'sim' | 'nao';
  discountPercent: string;
  /** Formas em que o desconto vale (nunca crédito). */
  discountMethods: string[];
};
export type DepositRule = {
  deposit: 'sim' | 'nao';
  depositKind: 'fixo' | 'percentual';
  depositValue: string;
};
export type PaymentDetails = InstallmentRule &
DiscountRule &
DepositRule & {
  /** "Como o cliente paga" (opcional, 300). */
  howToPay: string;
  /** P5: por padrão os serviços atendem convênio? 'todos' = Sim, todos · 'marcados' = Não, só os que eu marcar no serviço. */
  insuranceDefault: 'todos' | 'marcados';
};

export const blankInstallmentRule = (): InstallmentRule => ({ installments: 'nao', maxInstallments: '', interestFreeUpTo: 'todas' });
export const blankDiscountRule = (): DiscountRule => ({ discount: 'nao', discountPercent: '', discountMethods: ['pix'] });
export const blankDepositRule = (): DepositRule => ({ deposit: 'nao', depositKind: 'fixo', depositValue: '' });

export const blankPaymentDetails = (): PaymentDetails => ({
  ...blankInstallmentRule(),
  ...blankDiscountRule(),
  ...blankDepositRule(),
  howToPay: '',
  insuranceDefault: 'marcados'
});

/** Lote F (dados de exemplo aprovados em 22/10/2026): até 6x, sem juros até 2x; 5% no Pix; sem sinal. */
export const samplePaymentDetails = (): PaymentDetails => ({
  ...blankPaymentDetails(),
  installments: 'sim',
  maxInstallments: '6',
  interestFreeUpTo: '2',
  discount: 'sim',
  discountPercent: '5',
  discountMethods: ['pix']
});

export type EmpresaConfig = {
  name: string;
  /** Segmento: clinica · salao-barbearia · consultorio · outro (`data/segment.ts`). */
  segment: string;
  /** Especialidade (só Clínica e Consultório); vazio nos outros segmentos. */
  specialty: string;
  description: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  mapsLink: string;
  payments: string[];
  payment: PaymentDetails;
  acceptsInsurance: 'sim' | 'nao';
  insurers: string[];
  /** Lote F (F4): aviso da conversão do formato antigo, mostrado no campo "Como o cliente paga" na 1ª abertura. */
  paymentNotice?: string;
  cancellationPolicy: string;
  noShowPolicy: string;
  audience: string;
  links: ClinicLinks;
};

/**
 * Estado inicial do exemplo: endereço ainda incompleto (só bairro, cidade e UF vieram do cadastro antigo "Cidade e bairro"),
 * para o cartão de prontidão mostrar o que falta.
 */
export const empresaStore = createSavedStore<EmpresaConfig>({
  name: 'Clínica Vida Plena Estética',
  segment: 'clinica',
  specialty: 'estetica',
  description: 'Clínica de estética facial e corporal no Cambuí, com atendimento personalizado.',
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: 'Cambuí',
  city: 'Campinas',
  uf: 'SP',
  mapsLink: '',
  payments: ['pix', 'credito', 'debito'],
  payment: samplePaymentDetails(),
  acceptsInsurance: 'nao',
  insurers: [],
  cancellationPolicy: 'Cancelamento ou remarcação com até 24 horas de antecedência, sem custo.',
  noShowPolicy: '',
  audience: 'Mulheres e homens a partir de 18 anos.',
  // Valor antigo era texto livre ("instagram.com/vidaplenaestetica"): convertido por migrateLinks.
  links: migrateLinks('instagram.com/vidaplenaestetica')
});

// G4 (F-062): os arquivos compartilhados (schedule.ts, ScheduleEditor.tsx) leem o segmento em uso por `wordsNow()`.
setCurrentSegment(empresaStore.get().segment);
empresaStore.subscribe(() => setCurrentSegment(empresaStore.get().segment));

/** Palavras do negócio de uma configuração (salva ou rascunho). */
export const businessWordsOf = (c: Pick<EmpresaConfig, 'segment'>) => businessWords(c.segment);

/** Palavras do negócio pelo segmento SALVO (clínica · salão · consultório · empresa). Telas que ainda não estão em edição usam esta. */
export function useBusinessWords() {
  return businessWords(useSavedStore(empresaStore).segment);
}

/** Fora do React (textos montados em data/*): palavras pelo segmento salvo no momento da chamada. */
export const currentWords = () => businessWords(empresaStore.get().segment);

/** G4 (F-062): exemplos e sugestões do segmento/especialidade salvos. */
export const currentContent = (): SegmentContent => segmentContent(empresaStore.get().segment, empresaStore.get().specialty);
export function useSegmentContent(): SegmentContent {
  const e = useSavedStore(empresaStore);
  return segmentContent(e.segment, e.specialty);
}

/** Exemplo de descrição pelo segmento (antes era só de clínica estética). */
export const descriptionExample = (c: Pick<EmpresaConfig, 'segment' | 'specialty'>) => segmentContent(c.segment, c.specialty).demo.about;

/**
 * G4 (F-062): avisos do segmento, guardados na sessão (sem backend).
 * - `migratedFrom`: valor antigo convertido (ex.: "estetica" → Clínica · Estética). Mostra "Confira o segmento" UMA vez.
 * - `changedServices`: o segmento mudou com serviços cadastrados → "Seus serviços continuam; quer revisar as áreas?".
 * Nada aqui apaga ou troca serviços.
 */
export type SegmentNotices = {migratedFrom: string | null;changedServices: number;};
export const segmentNoticeStore = createSavedStore<SegmentNotices>({ migratedFrom: null, changedServices: 0 });
export const useSegmentNotices = () => useSavedStore(segmentNoticeStore);
export const dismissMigratedNotice = () => segmentNoticeStore.set({ ...segmentNoticeStore.get(), migratedFrom: null });
export const dismissServicesNotice = () => segmentNoticeStore.set({ ...segmentNoticeStore.get(), changedServices: 0 });

/**
 * Grava segmento/especialidade recebidos (handoff) ou escolhidos (seletor de telas, Empresa). Valor antigo é convertido
 * e marca o aviso "Confira o segmento". Mudança de segmento com serviços cadastrados marca o aviso das áreas.
 */
export function applySegmentValue(rawSegment: string, rawSpecialty: string | undefined, activeServiceCount: number) {
  const m = migrateSegment(rawSegment, rawSpecialty);
  if (!m.segment) return;
  const cur = empresaStore.get();
  const changed = m.segment !== cur.segment;
  empresaStore.set({ ...cur, segment: m.segment, specialty: m.specialty });
  segmentNoticeStore.set({
    migratedFrom: segmentWasMigrated(rawSegment) ? rawSegment : segmentNoticeStore.get().migratedFrom,
    changedServices: changed && activeServiceCount > 0 ? activeServiceCount : segmentNoticeStore.get().changedServices
  });
}

export const isAddressComplete = (c: EmpresaConfig) => Boolean(c.street.trim() && c.number.trim() && c.city.trim() && c.uf);
/** G2 (F-034): primeiro campo do endereço que falta (id do campo em IA Orniplaty › Empresa), para o atalho focar nele. */
export const firstMissingAddressField = (c: EmpresaConfig) =>
!c.street.trim() ? 'endereco-rua' : !c.number.trim() ? 'endereco-numero' : !c.city.trim() ? 'endereco-cidade' : !c.uf ? 'endereco-uf' : 'endereco';

/**
 * "Rua X, 1200, sala 54 – Cambuí, Campinas/SP". Sem rua devolve vazio: a prévia então mostra que a assistente
 * passa a pergunta para a equipe, em vez de responder um endereço pela metade.
 */
export function formatAddress(c: Pick<EmpresaConfig, 'street' | 'number' | 'complement' | 'district' | 'city' | 'uf'>) {
  if (!c.street.trim()) return '';
  const first = [c.street.trim(), c.number.trim(), c.complement.trim()].filter(Boolean).join(', ');
  const cityUf = [c.city.trim(), c.uf].filter(Boolean).join('/');
  const second = [c.district.trim(), cityUf].filter(Boolean).join(', ');
  return [first, second].filter(Boolean).join(' – ');
}

/* ───────────── Links (E5) ───────────── */

function stripProtocol(u: string) {
  return u.trim().replace(/^https?:\/\//i, '');
}

/** "@suaclinica" ou "instagram.com/suaclinica" → "instagram.com/suaclinica". Outros textos voltam como vieram. */
export function normalizeInstagram(raw: string) {
  const t = raw.trim();
  if (/^@[\w.]+$/.test(t)) return `instagram.com/${t.slice(1)}`;
  return stripProtocol(t).replace(/^www\.instagram\.com/i, 'instagram.com');
}
export const isInstagram = (v: string) => /^instagram\.com\/[\w.]+\/?$/i.test(normalizeInstagram(v));
export const isFacebook = (v: string) => /^(www\.)?(facebook\.com|fb\.com)\/[\w.\-/?=]+$/i.test(stripProtocol(v));
/** Parece um endereço: domínio com ponto (ex.: suaclinica.com.br/pacotes). */
export const looksLikeUrl = (v: string) => /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(stripProtocol(v));

/** Converte o texto antigo de "Links úteis" (um link por vírgula ou linha) para os campos separados. */
export function migrateLinks(old: string | ClinicLinks): ClinicLinks {
  if (typeof old !== 'string') return old;
  const out: ClinicLinks = { instagram: '', facebook: '', site: '', custom: [] };
  old.
  split(/[\n,;]+/).
  map((x) => x.trim()).
  filter(Boolean).
  forEach((x, i) => {
    if (!out.instagram && (x.startsWith('@') || /instagram\.com/i.test(x))) out.instagram = normalizeInstagram(x);else
    if (!out.facebook && /(facebook|fb)\.com/i.test(x)) out.facebook = stripProtocol(x);else
    if (!out.site) out.site = stripProtocol(x);else
    if (out.custom.length < MAX_CUSTOM_LINKS) out.custom.push({ id: `l${i}`, label: '', url: stripProtocol(x) });
  });
  return out;
}

/** Erros dos links por campo (`link-instagram`, `link-facebook`, `link-site`, `link-<id>-nome`, `link-<id>-url`). */
export function linkErrors(l: ClinicLinks): Record<string, string> {
  const e: Record<string, string> = {};
  if (l.instagram.trim() && !isInstagram(l.instagram)) e['link-instagram'] = 'Use instagram.com/seuperfil ou @seuperfil.';
  if (l.facebook.trim() && !isFacebook(l.facebook)) e['link-facebook'] = 'Use facebook.com/suapagina.';
  if (l.site.trim() && !looksLikeUrl(l.site)) e['link-site'] = 'Confira o endereço. Ex.: www.seusite.com.br';
  l.custom.forEach((c) => {
    const hasUrl = Boolean(c.url.trim());
    const hasLabel = Boolean(c.label.trim());
    if (hasUrl && !hasLabel) e[`link-${c.id}-nome`] = 'Dê um nome para este link.';
    if (hasLabel && !hasUrl) e[`link-${c.id}-url`] = 'Cole o endereço deste link.';
    if (hasUrl && !looksLikeUrl(c.url)) e[`link-${c.id}-url`] = 'Confira o endereço. Ex.: seusite.com.br/promocoes';
  });
  return e;
}

/* ───────────── Google Maps (E8) ───────────── */

/** Só links de compartilhar do Google Maps: maps.app.goo.gl, goo.gl/maps, google.com/maps ou maps.google.com. */
export const isMapsLink = (v: string) =>
/^(maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|(www\.)?google\.[a-z.]+\/maps(\/\S*)?|maps\.google\.[a-z.]+(\/\S*)?)$/i.test(stripProtocol(v));

/* ───────────── Pagamento (E6) ───────────── */

export const INSTALLMENT_OPTIONS = Array.from({ length: 11 }, (_, i) => ({ value: String(i + 2), label: `${i + 2}x` }));

/** "Sem juros até": Todas sem juros · Até 2x … até uma a menos que o máximo · Todas com juros. */
export function interestFreeOptions(max: string) {
  const n = Number(max) || 0;
  const mid = n > 2 ? Array.from({ length: n - 2 }, (_, i) => ({ value: String(i + 2), label: `Até ${i + 2}x` })) : [];
  return [{ value: 'todas', label: 'Todas sem juros' }, ...mid, { value: 'nenhuma', label: 'Todas com juros' }];
}

/** G1 (F-055): conversor único (utils/currency.ts). */
const toNumber = (v: string) => parseBRL(v);
export const formatBRLValue = (v: string | number) =>
(typeof v === 'number' ? v : toNumber(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toNumberBR = toNumber;

export function paymentSentence(ids: string[]) {
  const labels = paymentMethods.filter((p) => ids.includes(p.value)).map((p) => p.label.toLowerCase().replace('pix', 'Pix'));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

/*
 * G1 (23/10/2026, F-004/F-014): a cópia fixa `businessProfile` foi REMOVIDA. O nome da empresa tem UMA fonte —
 * `empresaStore.name` (salvo em IA Orniplaty › Empresa). Início, apresentação da assistente, Conversas, Configurações ›
 * WhatsApp, Oportunidades e Retornos leem por `useBusinessName()` (componentes) ou `businessName()` (fora do React).
 */
/** Nome da empresa SALVO (fora de componentes). */
export const businessName = () => empresaStore.get().name.trim() || 'Sua empresa';
/** Nome da empresa salvo, redesenhando quando muda. */
export const useBusinessName = () => useSavedStore(empresaStore).name.trim() || 'Sua empresa';