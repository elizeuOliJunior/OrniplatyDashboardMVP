/**
 * Prévia da assistente por INTENÇÃO, com a fonte declarada (G1 · subetapa 4, F-011/F-012, 25/10/2026). SIMULAÇÃO local:
 * não é a IA real. Monta a resposta só com o que está cadastrado e diz de onde veio ("Ela responde com base em: …").
 * Sem a informação, admite e passa para a equipe. Nunca inventa preço, horário, convênio, serviço, pacote, política ou
 * orientação clínica. Preço ou compra de pacote: sempre com a equipe (sem catálogo de pacote nem oferta autônoma).
 *
 * Fontes (só leitura; nenhuma cópia de cadastro):
 *  - Funcionamento: horário semanal e datas especiais da clínica (`clinicDay`, data/availability.ts).
 *  - Agenda: horários livres pela regra única (`freeStartTimes`) e dias de trabalho do profissional (`effectiveDayById`).
 *  - Empresa: endereço, Maps, links, regras de pagamento (data/paymentRules.ts) e a lista de convênios.
 *  - Serviço: preço e modo de preço, duração, profissionais ATIVOS que fazem, preparo, cuidados, o que inclui,
 *    contraindicação, avaliação (só serviço de avaliação ATIVO), sinônimos e "O que não dizer". Serviço arquivado não é oferecido.
 *  - Conhecimento: perguntas e respostas da clínica (para o que não está em outro cadastro).
 *  - Políticas: cancelamento e falta (Empresa). Como atender: os limites ("Prometer resultado" etc.).
 *  - Pacote do cliente: saldo VERIFICADO nas vendas (data/api/pacotes.ts), só com o cliente identificado.
 * BACKEND: o prompt real (prompts.py) lê hoje só parte disso. Ver docs/ia-orniplaty.md ("Fontes da assistente").
 */
import { NOW, TODAY_ISO } from './agendaStore';
import { wordsNow } from './segment';
import { getAgendaState } from './agendaLive';
import { clinicPeriods, publicReasonOf, rangesText } from './schedule';
import type { ScheduleOverride, TimeRange } from './schedule';
import { clinicDay, effectiveDayById, freeStartTimes, getTeam, isActiveMember } from './availability';
import { formatAddress, isAddressComplete } from './empresa';
import type { EmpresaConfig } from './empresa';
import type { ServiceItem } from './servicesStore';
import type { KnowledgeEntry } from './conhecimento';
import { PASS_TO_TEAM, clinicAnswer, paymentTopicOf, serviceAnswer } from './paymentRules';
import { listPackages } from './api/pacotes';
import { getBookingRules } from './bookingRules';
import { savedSendWindows } from './automacoes';
import { windowText } from './sendWindows';

export type AnswerContext = {
  empresa: EmpresaConfig;
  services: ServiceItem[];
  knowledge: KnowledgeEntry[];
  /** Limites de Como atender (ids de CANNOT_DO_OPTIONS). */
  cannotDo: string[];
  /** Serviço em edição ("Testar como cliente" do serviço): vale quando a pergunta não cita outro. */
  focusService?: ServiceItem;
  /** Cliente identificado pelo WhatsApp (só para o saldo verificado do pacote). */
  clientId?: string | null;
  clientName?: string;
};
export type AssistantAnswer = {text: string;source: string;handoff?: boolean;};

const TEAM = (text = 'Não tenho essa informação aqui. Vou pedir para alguém da equipe te responder.', source = 'Sem informação cadastrada: passa para a equipe'): AssistantAnswer => ({ text, source, handoff: true });

export const norm = (t: string) =>
t.
toLowerCase().
normalize('NFD').
replace(/[̀-ͯ]/g, '').
replace(/[^a-z0-9/ ]/g, ' ').
replace(/\s+/g, ' ').
trim();
const has = (q: string, re: RegExp) => re.test(q);
const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const WEEKDAY_LABEL = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const wd = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** W2: minutos do dia ("09:20" → 560) e dias entre duas datas, para a antecedência mínima. */
const toMinOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (l: string[]) => l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;

/** Data citada na pergunta: hoje, amanhã, dd/mm ou um dia da semana (o próximo). */
function dateOf(q: string): string | null {
  if (has(q, /\bhoje\b/)) return TODAY_ISO;
  if (has(q, /\bamanha\b/)) return addDays(TODAY_ISO, 1);
  const m = q.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) return `${TODAY_ISO.slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const i = WEEKDAYS.findIndex((d) => q.includes(d));
  if (i >= 0) {
    for (let k = 0; k <= 7; k++) if (wd(addDays(TODAY_ISO, k)) === i) return addDays(TODAY_ISO, k);
  }
  return null;
}

/** Profissional ATIVO citado pelo nome (ex.: "Dra. Carolina", "Juliana"). */
function professionalOf(q: string) {
  return getTeam().members.filter(isActiveMember).find((m) => {
    const parts = norm(m.name).replace(/^dra?\s+/, '').split(' ');
    return parts.some((p) => p.length > 2 && new RegExp(`\\b${p}\\b`).test(q));
  });
}

/** Serviço citado (nome ou "como o cliente chama"). Devolve também os arquivados, para dizer que não está disponível. */
export function servicesIn(q: string, services: ServiceItem[]): ServiceItem[] {
  const hits = services.filter((s) => {
    const names = [s.name, ...s.knowledge.synonyms].map(norm).filter((n) => n.length > 2);
    return names.some((n) => q.includes(n) || n.split(' ').filter((w) => w.length > 4).some((w) => q.includes(w)));
  });
  // Nome exato vence palavra solta ("limpeza de pele" × "pele").
  return hits.sort((a, b) => Number(q.includes(norm(b.name))) - Number(q.includes(norm(a.name))));
}

const proNamesOf = (s: ServiceItem) => getTeam().members.filter((m) => isActiveMember(m) && s.professionalIds.includes(m.id)).map((m) => m.name);
const activeEval = (s: ServiceItem, all: ServiceItem[]) => s.knowledge.requiresEvaluation ? all.find((x) => x.id === s.knowledge.evaluationServiceId && x.active) ?? null : null;

/** Pronomes e palavras de pergunta que não são o nome de um serviço ("vocês fazem isso?"). */
const NOT_A_SERVICE = /^(isso|isto|esse|essa|este|esta|ele|ela|sim|ai|aqui|quantas|quantos|quanto|como|algum|alguma|alguem|que|qual|hoje|amanha)\b/;
/** O que vem depois de "fazem/faz/tem/oferecem/trabalham com", quando parece um assunto (nome de serviço). */
function askedObject(q: string): string | null {
  const m = q.match(/\b(fazem|faz|tem|oferecem|trabalham com)\s+([a-z ]{4,})/);
  const obj = m?.[2].trim() ?? '';
  return obj && !NOT_A_SERVICE.test(obj) ? obj : null;
}

/** Pedido de explicação do serviço: aqui a descrição é a resposta certa. */
const EXPLAIN = /(como e\b|como funciona|o que e\b|o que acontece|explica|me fala|me conta|me explica|sobre (a|o|as|os)\b|mais sobre|detalhes)/;
/** Palavras que não são assunto: verbos de oferta, artigos, pronomes e cortesia. */
const FILLER = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'um', 'uma', 'voces', 'vcs', 'voce', 'ai', 'aqui', 'ainda', 'tem', 'fazem', 'faz', 'fazer', 'oferecem', 'oferece', 'trabalham', 'com', 'atendem', 'sim', 'oi', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'por', 'favor', 'gostaria', 'queria', 'quero', 'saber', 'se', 'isso', 'esse', 'essa', 'ok', 'marcar', 'agendar', 'reservar']);
/** Nomes do serviço (nome + como o cliente chama), normalizados, do mais longo ao mais curto. */
const serviceNames = (s: ServiceItem) => [s.name, ...s.knowledge.synonyms].map(norm).filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
/**
 * Revisão do G1 (F-011): o que a pergunta pede ALÉM do nome do serviço. Vazio = "vocês fazem limpeza de pele?" (oferta);
 * com palavras = um atributo ("tem anestesia?", "usa anestesia?"), que só se confirma com fonte cadastrada.
 */
function attributeWords(q: string, s: ServiceItem): string[] {
  let rest = ` ${q} `;
  serviceNames(s).forEach((n) => rest = rest.split(` ${n} `).join(' '));
  const own = new Set(serviceNames(s).flatMap((n) => n.split(' ')));
  return rest.split(' ').filter((w) => w.length > 2 && !FILLER.has(w) && !own.has(w));
}
/** Pergunta frequente (do serviço ou do Conhecimento) que responde ao assunto: casa pelas palavras do assunto, nunca pelo nome do serviço. */
function faqFor(q: string, s: ServiceItem, list: {question: string;answer: string;}[], exact = false) {
  const own = new Set(serviceNames(s).flatMap((n) => n.split(' ')));
  const words = (t: string) => [...new Set(norm(t).split(' ').filter((w) => w.length > 3 && !STOP.has(w) && !FILLER.has(w) && !own.has(w)))];
  return list.
  filter((f) => f.question.trim() && f.answer.trim()).
  map((f) => {
    const ws = words(f.question);
    const score = ws.filter((w) => q.includes(w)).length;
    // `exact`: a pergunta traz TODAS as palavras de assunto do FAQ (pelo menos duas): ela vence as regras genéricas.
    return { f, score, ok: exact ? ws.length >= 2 && score === ws.length : score >= 1 };
  }).
  sort((a, b) => b.score - a.score).
  find((x) => x.ok)?.f;
}

/** Resposta sobre UM serviço (intenção já sem o nome do serviço). */
function serviceIntent(q: string, s: ServiceItem, ctx: AnswerContext, cited = true): AssistantAnswer | null {
  const name = s.name;
  const k = s.knowledge;
  const src = `Serviço: ${name}`;
  if (!s.active && !cited && askedObject(q)) return null;
  if (!s.active) return TEAM(`No momento não estamos oferecendo ${lower(name)}. Vou pedir para alguém da equipe te responder.`, `Serviço: ${name} (arquivado): passa para a equipe`);
  const pay = paymentTopicOf(q);
  if (pay) {
    const t = serviceAnswer(pay, s, ctx.empresa);
    return t ? { text: t, source: `${src} · regras de pagamento` } : TEAM(PASS_TO_TEAM, `${src} · regra de pagamento incompleta: passa para a equipe`);
  }
  // Revisão do G1 (F-011): pergunta frequente do serviço que bate por completo vence duração e preço
  // ("De quanto em quanto tempo devo fazer limpeza de pele?" tem resposta cadastrada; não é a duração).
  const exactFaq = faqFor(q, s, k.faqs, true);
  if (exactFaq) return { text: exactFaq.answer.trim(), source: `${src} · pergunta frequente "${exactFaq.question.trim()}"` };
  // Duração antes de preço: "quanto tempo dura" não é pergunta de preço.
  if (has(q, /(quanto tempo|demora|dura\b|duracao|quantos minutos|leva quanto)/)) return { text: `${name} dura cerca de ${s.durationMin} minutos.`, source: `${src} · duração` };
  if (has(q, /(quanto custa|quanto e\b|quanto fica|preco|valor|custa)/)) {
    if (s.priceMode === 'sob-consulta') {
      const ev = activeEval(s, ctx.services);
      return { text: `Para ${lower(name)}, o valor é definido depois da avaliação${ev ? ` (${lower(ev.name)}, ${ev.durationMin} min)` : ''}. Quer que eu veja um horário para a avaliação?`, source: `${src} · sob consulta` };
    }
    if (!(s.price > 0)) return TEAM(`Vou confirmar o valor de ${lower(name)} com a equipe e já te retorno.`, `${src} · sem preço cadastrado: passa para a equipe`);
    return s.priceMode === 'a-partir' ?
    { text: `${name} começa em ${brl(s.price)}. O valor final a profissional confirma no atendimento.`, source: `${src} · preço (a partir de)` } :
    { text: `${name} custa ${brl(s.price)}.`, source: `${src} · preço` };
  }
  if (has(q, /(garant|resultado|funciona mesmo|vai resolver)/)) {
    const limit = ctx.cannotDo.includes('resultado');
    if (limit || k.dontSay.trim()) return { text: `Não prometemos resultado: cada caso é avaliado pela profissional na consulta, e ela explica o que esperar.`, source: `${src} · O que não dizer${limit ? ' · Como atender (não prometer resultado)' : ''}` };
    return TEAM(undefined, `${src} · sem orientação cadastrada: passa para a equipe`);
  }
  if (has(q, /(gravida|gestante|amament|contraindic|posso fazer|pode fazer|alergi|problema de saude|doenca)/)) {
    if (!k.contraindications.trim()) return TEAM(`Isso a profissional precisa avaliar com você. Vou pedir para alguém da equipe te responder.`, `${src} · sem contraindicação cadastrada: passa para a equipe`);
    if (has(q, /(gravida|gestante|amament)/) && !/(gravid|gestant|amament)/.test(norm(k.contraindications)))
    return TEAM(`Isso a profissional precisa avaliar com você. Vou pedir para alguém da equipe te responder.`, `${src} · contraindicação não cita gestação: passa para a equipe`);
    return { text: `${k.contraindications.trim()} Quem confirma no seu caso é quem vai te atender${activeEval(s, ctx.services) ? ', na avaliação' : ''}.`, source: `${src} · quando não é indicado` };
  }
  if (has(q, /(avaliacao|avaliar|consulta antes|primeira vez|precisa de consulta)/)) {
    if (!k.requiresEvaluation) return { text: `Não precisa de avaliação antes: dá para agendar ${lower(name)} direto.`, source: `${src} · exige avaliação: não` };
    const ev = activeEval(s, ctx.services);
    return ev ?
    { text: `Para ${lower(name)}, antes fazemos ${lower(ev.name)} (${ev.durationMin} min). Quer que eu veja um horário?`, source: `${src} · exige avaliação (${ev.name})` } :
    { text: `Para ${lower(name)}, antes é preciso uma avaliação. Vou pedir para a equipe ver o melhor horário.`, source: `${src} · exige avaliação (serviço de avaliação não está ativo): passa para a equipe`, handoff: true };
  }
  if (has(q, /(antes|preparo|preparar|jejum|levar|devo fazer)/)) return k.prepBefore.trim() ? { text: k.prepBefore.trim(), source: `${src} · preparo antes` } : TEAM(undefined, `${src} · sem preparo cadastrado: passa para a equipe`);
  if (has(q, /(depois|cuidado|sol\b|praia|maquiagem|pos |academia)/)) return k.careAfter.trim() ? { text: k.careAfter.trim(), source: `${src} · cuidados depois` } : TEAM(undefined, `${src} · sem cuidados cadastrados: passa para a equipe`);
  if (has(q, /(inclui|incluso|incluido|o que vem|o que tem no)/)) return k.included.trim() ? { text: `Inclui: ${k.included.trim()}`, source: `${src} · o que está incluído` } : TEAM(undefined, `${src} · sem "o que inclui" cadastrado: passa para a equipe`);
  if (has(q, /(quem faz|quem atende|qual profissional|com quem)/)) {
    const pros = proNamesOf(s);
    return pros.length ? { text: `Quem faz ${lower(name)}: ${joinAnd(pros)}.`, source: `${src} · quem faz (profissionais ativos)` } : TEAM(undefined, `${src} · nenhum profissional ativo: passa para a equipe`);
  }
  if (has(q, /(online|video|remot|distancia)/)) return { text: s.modality === 'online' ? `${name} é feito online, por vídeo.` : `${name} é presencial, na ${ctx.empresa.name}.`, source: `${src} · modalidade` };
  // Revisão do G1: "fazem/tem/oferecem X?" só confirma ESTE serviço quando ele foi citado. Com o serviço só em foco
  // (testador do serviço) e outro assunto depois do verbo, a pergunta é sobre outra coisa: quem decide é o guarda de
  // serviço não cadastrado.
  if (!cited && askedObject(q)) return null;
  // Revisão do G1 (F-011): pergunta frequente DO serviço que responde ao assunto perguntado.
  const faq = faqFor(q, s, k.faqs);
  if (faq) return { text: faq.answer.trim(), source: `${src} · pergunta frequente "${faq.question.trim()}"` };
  const parts = [k.description.trim(), k.included.trim() ? `Inclui: ${k.included.trim()}` : ''].filter(Boolean);
  // Pedido de explicação: a descrição responde.
  if (has(q, EXPLAIN)) return parts.length ? { text: parts.join(' '), source: `${src} · descrição` } : TEAM(undefined, `${src} · sem descrição cadastrada: passa para a equipe`);
  // Oferta ("vocês fazem/têm X?"): confirma só quando a pergunta não pede outra coisa além do serviço.
  const attr = cited ? attributeWords(q, s) : [];
  if (has(q, /\b(fazem|faz|tem|oferecem|trabalham com|atendem)\b/) && attr.length === 0)
  return parts.length ? { text: `Fazemos sim. ${parts.join(' ')}`, source: `${src} · descrição` } : { text: `Fazemos ${lower(name)} sim. Quer que eu veja um horário?`, source: `${src} · cadastro` };
  // Atributo sem fonte cadastrada ("tem anestesia?", "usa anestesia?"): admite e passa para a equipe.
  if (attr.length > 0) {
    // Fonte da clínica (Conhecimento) que responda ao mesmo assunto ainda vale.
    const clinic = faqFor(q, s, ctx.knowledge);
    if (clinic) return { text: clinic.answer.trim(), source: `Conhecimento · "${clinic.question.trim()}"` };
    return TEAM(undefined, `${src} · sem essa informação cadastrada (${attr.join(' ')}): passa para a equipe`);
  }
  return null;
}

/** "das 08:00 às 12:00 e das 14:00 às 18:00" */
const periodsText = (ws: {start: string;end: string;}[]) => ws.map((w) => `das ${w.start} às ${w.end}`).join(' e ');

/** Horário da clínica num dia (data especial vence o horário da semana). */
function dayAnswer(iso: string, label: string): AssistantAnswer {
  const c = clinicDay(iso);
  // G3 (F-058, D5): o cliente só vê o motivo PÚBLICO (nome oficial de feriado ou motivo marcado para o cliente).
  if (!c.open) return { text: `${label} ${wordsNow().the} não abre${c.publicWhy ? ` (${c.publicWhy})` : ''}.`, source: 'Funcionamento · datas especiais e horário da semana' };
  // G3 (F-050): vários períodos no dia aparecem todos ("das 08:00 às 12:00 e das 14:00 às 18:00").
  // Correção da revisão (F-058): abertura extraordinária ou expediente reduzido diz o motivo PÚBLICO quando a clínica marcou
  // "Mostrar o motivo ao cliente" (`publicWhy`); sem a marcação, só "(horário especial)".
  const special = c.special ? c.publicWhy ? ` (horário especial: ${c.publicWhy})` : ' (horário especial)' : '';
  return { text: `${label} atendemos ${periodsText(c.windows)}${special}.`, source: c.special ? 'Funcionamento · datas especiais' : 'Funcionamento · horário da semana' };
}

/* ───────────── ausência do profissional (G3, F-058, revisão v3) ───────────── */

const coversIso = (o: ScheduleOverride, iso: string) => o.from <= iso && iso <= o.to;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/**
 * Motivo de uma ausência do profissional que o CLIENTE pode ver: só com "Mostrar o motivo ao cliente" (`reasonShared`,
 * gravado pelo ScheduleEditor). Sem a marcação (inclusive registros antigos), o motivo é nota interna e nunca aparece.
 */
const sharedReasonOf = (o?: ScheduleOverride) => o?.reasonShared && o.reason.trim() ? o.reason.trim() : '';
type ProMember = ReturnType<typeof getTeam>['members'][number];
/** O que vale para o profissional na data: folga/férias, horário especial ou bloqueios parciais (com o motivo público de cada um). */
function proNotesOn(pro: ProMember, iso: string) {
  const day = effectiveDayById(pro.id, iso);
  const overrides = (pro.overrides ?? []).filter((o) => coversIso(o, iso));
  const off = day.override?.kind === 'off' ? day.override : undefined;
  const special = day.override?.kind === 'hours' ? day.override : undefined;
  const blocks = off ? [] : overrides.filter((o) => o.kind === 'block');
  return { day, off, special, blocks };
}
/** "às 15:00" ou "15h30" pedido na pergunta. */
function askedTimeOf(q: string): string | null {
  // `norm` troca ":" por espaço: "15:30" chega como "15 30"; "15h" e "15h30" chegam como estão.
  const m = q.replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ').match(/\b(\d{1,2})\s*h\s*(\d{2})?\b|\b(\d{1,2}) (\d{2})\b/);
  if (!m) return null;
  const h = Number(m[1] ?? m[3]);
  const min = m[2] ?? m[4] ?? '00';
  return h >= 6 && h <= 21 && Number(min) < 60 ? `${String(h).padStart(2, '0')}:${min}` : null;
}
const inRanges = (t: string, ranges: TimeRange[]) => ranges.some((r) => toMin(t) >= toMin(r.start) && toMin(t) < toMin(r.end));
const otherProsHint = (pro: ProMember) => getTeam().members.filter(isActiveMember).length > 1 ? ' ou outra profissional' : '';
const absenceSource = (pro: ProMember, why: string) => `Agenda · ausência de ${pro.name}${why ? ' · motivo marcado para o cliente' : ' · motivo interno (não mostrado)'}`;

/** "Por que o Rafael não atende em 19/10?": responde a ausência e, só com a marcação, o motivo. */
function proAbsenceAnswer(pro: ProMember, iso: string, label: string): AssistantAnswer | null {
  const n = proNotesOn(pro, iso);
  if (n.off) {
    const why = sharedReasonOf(n.off);
    const span = n.off.from !== n.off.to ? ` (de ${dm(n.off.from)} a ${dm(n.off.to)})` : '';
    return {
      text: why ?
      `${label}, ${pro.name} não atende${span}: ${why}. Quer que eu veja outro dia${otherProsHint(pro)}?` :
      `${label}, ${pro.name} não atende${span}. Quer que eu veja outro dia${otherProsHint(pro)}?`,
      source: absenceSource(pro, why)
    };
  }
  if (n.special) {
    const why = sharedReasonOf(n.special);
    const when = n.day.windows.length ? `atende só ${periodsText(n.day.windows)}` : 'não atende';
    return { text: `${label}, ${pro.name} ${when} (horário especial${why ? `: ${why}` : ''}). Quer que eu veja um horário?`, source: absenceSource(pro, why) };
  }
  if (n.blocks.length) {
    const why = n.blocks.map(sharedReasonOf).filter(Boolean).join('; ');
    const ranges = n.blocks.flatMap((b) => b.ranges);
    return { text: `${label}, ${pro.name} não atende ${periodsText(ranges)}${why ? ` (${why})` : ''}. Fora disso, posso ver um horário para você.`, source: absenceSource(pro, why) };
  }
  return null;
}

/** Resposta da prévia para UMA pergunta do cliente. */
export function answerQuestion(question: string, ctx: AnswerContext): AssistantAnswer {
  const q = norm(question);
  if (!q) return { text: '', source: '' };
  const e = ctx.empresa;

  // 1) pedidos que sempre vão para uma pessoa / que a prévia não deve inventar
  if (has(q, /(falar com|quero) (uma )?(pessoa|atendente|humano|alguem)/)) return TEAM('Claro! Vou chamar alguém da equipe para falar com você.', 'Pedido de atendimento humano: passa para a equipe');
  if (has(q, /(audio|foto|imagem|video que mandei|print)/)) return TEAM('Vou pedir para alguém da equipe ver o que você mandou e te responder.', 'Áudio ou foto: a equipe responde');
  if (has(q, /(outra unidade|mesma clinica|filial|rua |unidade)/)) return TEAM(undefined, 'Endereço cadastrado tem uma unidade só: passa para a equipe');
  if (has(q, /(menor|crianca|adolescente|idade minima|anos pode)/)) return TEAM(undefined, 'Público atendido não está cadastrado: passa para a equipe');
  // W8 (12/11/2026): os dias e o horário das campanhas são os que a clínica salvou em IA Orniplaty › Automações.
  if (has(q, /(responde|atende|funciona).*(23|22|21|noite|madrugada|qualquer hora|fim de semana)|(23|22)h/)) {
    const campaigns = windowText(savedSendWindows().campaigns);
    return { text: `Eu respondo por aqui a qualquer hora. As mensagens que ${wordsNow().the} manda para lembrar de voltar só saem ${campaigns}.`, source: `Regras de envio (Automações): respostas a qualquer hora; campanhas ${campaigns}` };
  }

  // 2) pacote: saldo verificado; preço/compra sempre com a equipe
  if (has(q, /pacote/)) {
    if (has(q, /(quanto custa|preco|valor|comprar|fechar um|quero um|tem pacote|promocao|desconto)/))
    return TEAM('Quem passa valores e condições de pacote é a equipe. Vou pedir para alguém te responder.', 'Pacote: preço e compra só com a equipe');
    if (has(q, /(quantas|saldo|sobr|restam|faltam|tenho|ainda)/)) {
      if (!ctx.clientId) return TEAM('Para ver o saldo do seu pacote eu preciso confirmar quem é você. Vou pedir para a equipe conferir.', 'Pacote do cliente: cliente não identificado, passa para a equipe');
      const list = listPackages({ client_id: ctx.clientId }).filter((p) => p.status === 'active' || p.status === 'frozen');
      if (list.length === 0) return TEAM('Não encontrei pacote ativo no seu cadastro. Vou pedir para a equipe conferir.', 'Pacote do cliente: nenhum pacote ativo nas vendas');
      const lines = list.map((p) => `${p.saldo} ${p.saldo === 1 ? 'sessão' : 'sessões'} de ${lower(p.service_name_snapshot)}${p.expires_at ? `, até ${dm(p.expires_at)}` : ''}${p.status === 'frozen' ? ' (pacote congelado)' : ''}`);
      return { text: `Você tem ${joinAnd(lines)}. Quer agendar a próxima?`, source: 'Pacote do cliente (saldo verificado nas vendas)' };
    }
  }

  // 3) políticas
  if (has(q, /(faltei|perdi o horario|nao fui|nao compareci|e se eu faltar|se faltar)/)) {
    const p = e.noShowPolicy.trim();
    return p ? { text: `${p} Quer que eu veja um novo horário?`, source: 'Política de falta (Empresa)' } : TEAM('Vou confirmar com a equipe o que acontece nesse caso e já te retorno. Quer que eu veja um novo horário?', 'Política de falta não cadastrada: passa para a equipe');
  }
  if (has(q, /(remarcar|cancelar|desmarcar|mudar o horario|trocar o horario)/)) {
    const p = e.cancellationPolicy.trim();
    const what = has(q, /cancel|desmarc/) ? 'cancele' : 'remarque';
    return p ? { text: `Pode sim. ${p} Quer que eu ${what} para você?`, source: 'Política de cancelamento (Empresa) · caminho de agendamento' } : TEAM('Vou confirmar a regra com a equipe e já te retorno.', 'Política de cancelamento não cadastrada: passa para a equipe');
  }

  // 4) pagamento e convênio (empresa ou serviço citado)
  const cited = servicesIn(q, ctx.services);
  const svc = cited[0] ?? ctx.focusService;
  const pay = paymentTopicOf(question);
  if (pay === 'convenio') {
    const listed = e.acceptsInsurance === 'sim' ? e.insurers : [];
    const named = listed.find((n) => q.includes(norm(n)));
    const asked = q.match(/(?:convenio|plano(?: de saude)?)\s+([a-z0-9]+(?:\s[a-z0-9]+)?)/)?.[1];
    if (asked && !named && !/^(de|da|do|saude)$/.test(asked) && !listed.some((n) => norm(n).startsWith(asked.split(' ')[0])))
    return { text: listed.length ? `Esse convênio não está na nossa lista. Atendemos ${joinAnd(listed)}. Quem confirma a cobertura é a equipe.` : 'No momento atendemos só particular. Quem confirma qualquer dúvida de convênio é a equipe.', source: 'Empresa · lista de convênios (convênio não listado não é prometido)' };
  }
  if (pay) {
    if (svc && svc.active) {
      const t = serviceAnswer(pay, svc, e);
      return t ? { text: t, source: `Serviço: ${svc.name} · regras de pagamento` } : TEAM(PASS_TO_TEAM, `Serviço: ${svc.name} · regra de pagamento incompleta: passa para a equipe`);
    }
    const t = clinicAnswer(pay, e, ctx.services.filter((s) => s.active));
    return t ? { text: t, source: 'Empresa · regras de pagamento' } : TEAM(PASS_TO_TEAM, 'Regra de pagamento incompleta: passa para a equipe');
  }

  // 5) endereço e links
  if (has(q, /(onde fica|endereco|localizacao|como chego|maps|mapa)/)) {
    const addr = formatAddress(e);
    // W9d (A5-18, 12/11/2026): a MESMA frase da prévia de IA Orniplaty › Empresa (`pages/AtendenteIaEmpresa.tsx`).
    if (!isAddressComplete(e)) return TEAM('Vou confirmar o endereço com a equipe e já te retorno.', 'Endereço incompleto em Empresa: passa para a equipe');
    return { text: `Ficamos na ${addr}.${e.mapsLink.trim() ? ` No mapa: ${e.mapsLink.trim()}` : ''}`, source: 'Empresa · endereço' };
  }
  if (has(q, /(instagram|insta\b|facebook|site|rede social|redes sociais)/)) {
    const l = e.links;
    const found = [l.instagram && `Instagram: ${l.instagram}`, l.facebook && `Facebook: ${l.facebook}`, l.site && `Site: ${l.site}`, ...l.custom.filter((c) => c.url).map((c) => `${c.label}: ${c.url}`)].filter(Boolean) as string[];
    return found.length ? { text: found.join(' · '), source: `Empresa · links ${wordsNow().of}` } : TEAM(undefined, 'Links não cadastrados: passa para a equipe');
  }

  // 6) agenda: horários livres e dias do profissional (regra única); lista de espera com a equipe
  if (has(q, /lista de espera/)) return TEAM('Vou pedir para a equipe te colocar na lista de espera desse dia e te avisar se abrir vaga.', 'Lista de espera: a equipe inclui');
  const pro = professionalOf(q);
  // G3 (F-058, revisão v3): "por que o Rafael não atende?" responde a ausência cadastrada; o motivo só com a marcação.
  if (pro && has(q, /(por que|porque|motivo|o que (houve|aconteceu)|ausente|ausencia|de folga|ferias|afastad|nao (atende|vai atender|esta atendendo|vem))/)) {
    let iso = dateOf(q);
    if (!iso) {
      for (let k = 0; k <= 60 && !iso; k++) {
        const d = addDays(TODAY_ISO, k);
        const n = proNotesOn(pro, d);
        if (n.off || n.special || n.blocks.length) iso = d;
      }
    }
    if (iso) {
      const label = iso === TODAY_ISO ? 'Hoje' : iso === addDays(TODAY_ISO, 1) ? 'Amanhã' : `Em ${dm(iso)}`;
      if (!clinicDay(iso).open) return dayAnswer(iso, label);
      const a = proAbsenceAnswer(pro, iso, label);
      if (a) return a;
      if (effectiveDayById(pro.id, iso).windows.length === 0) return { text: `${label}, ${pro.name} não atende nesse dia da semana. Quer que eu veja outro dia?`, source: `Agenda · dias de trabalho de ${pro.name}` };
      return { text: `${label}, ${pro.name} está atendendo normalmente. Quer que eu veja um horário?`, source: `Agenda · dias de trabalho de ${pro.name}` };
    }
    return { text: `${pro.name} está atendendo normalmente, sem ausência cadastrada nos próximos dias. Quer que eu veja um horário?`, source: `Agenda · dias de trabalho de ${pro.name}` };
  }
  if (pro && has(q, /(semana que vem|proxima semana)/)) {
    const days: string[] = [];
    const start = addDays(TODAY_ISO, (8 - wd(TODAY_ISO)) % 7 || 7);
    for (let i = 0; i < 6; i++) {
      const iso = addDays(start, i);
      const d = effectiveDayById(pro.id, iso);
      if (clinicDay(iso).open && d.windows.length > 0) days.push(`${WEEKDAY_LABEL[wd(iso)]} (${dm(iso)})`);
    }
    return days.length ? { text: `Na semana que vem, ${pro.name} atende ${joinAnd(days)}. Quer que eu veja um horário?`, source: `Agenda · dias de trabalho de ${pro.name}` } : { text: `Na semana que vem, ${pro.name} não tem dia de atendimento.`, source: `Agenda · dias de trabalho de ${pro.name}` };
  }
  // Revisão do G1 (F-011): pedido de agendamento ("quero marcar limpeza") vai para a Agenda, não para a descrição.
  if (has(q, /(tem horario|tem vaga|horario livre|disponivel|disponibilidade|consegue encaixar|tem como marcar|(quero|queria|gostaria de|posso|da para|como faco para) (marcar|agendar))/)) {
    // Revisão do G1: serviço arquivado (citado ou em foco) não ganha horário oferecido.
    if (svc && !svc.active) return serviceIntent(q, svc, ctx) as AssistantAnswer;
    // W2 (D-A3-2): Regras de agendamento da clínica. Antecedência mínima e limite de dias valem só para o que a
    // assistente oferece ao cliente (resposta 1 = a do Christian); sem dia pedido e hoje sem horário, ela procura nos
    // próximos dias configurados (resposta 3 = a).
    const rules = getBookingRules();
    const asked0 = dateOf(q);
    const lastIso = rules.maxDaysAhead ? addDays(TODAY_ISO, rules.maxDaysAhead) : null;
    if (asked0 && lastIso && asked0 > lastIso) {
      return { text: `Por aqui eu marco até ${rules.maxDaysAhead} dias à frente, até ${dm(lastIso)}. Para ${dm(asked0)}, vou pedir para alguém da equipe confirmar com você.`, source: 'Funcionamento · regras de agendamento' };
    }
    const period = has(q, /\btarde\b/) ? 'tarde' : has(q, /\bmanha\b/) ? 'manha' : null;
    const nowMin = toMinOf(NOW);
    const fitOn = (day: string) => (t: string) =>
    (period === 'tarde' ? t >= '12:00' : period === 'manha' ? t < '12:00' : true) && (day !== TODAY_ISO || t > NOW) && daysBetween(TODAY_ISO, day) * 1440 + toMinOf(t) - nowMin >= rules.minNoticeMin;
    const duration = svc?.durationMin ?? 60;
    const pros = (pro ? [pro] : getTeam().members.filter(isActiveMember)).filter((m) => !svc || svc.professionalIds.includes(m.id));
    const linesOn = (day: string) =>
    pros.
    map((m) => ({ m, times: freeStartTimes(getAgendaState(), m.id, day, duration).filter(fitOn(day)).slice(0, 3) })).
    filter((x) => x.times.length > 0).
    map((x) => `${x.m.name}: ${x.times.join(', ')}`);
    let iso = asked0 ?? TODAY_ISO;
    if (!asked0 && !(pro && proNotesOn(pro, iso)?.off)) {
      for (let i = 0; i < Math.max(1, rules.assistantDays); i++) {
        const day = addDays(TODAY_ISO, i);
        if (lastIso && day > lastIso) break;
        if (clinicDay(day).open && linesOn(day).length) {
          iso = day;
          break;
        }
      }
    }
    const label = iso === TODAY_ISO ? 'Hoje' : iso === addDays(TODAY_ISO, 1) ? 'Amanhã' : `Em ${dm(iso)}`;
    if (!clinicDay(iso).open) return dayAnswer(iso, label);
    // G3 (F-058, revisão v3): com o profissional citado, a ausência dele responde a pergunta (folga/férias, horário
    // pedido dentro de um bloqueio) e o motivo só aparece com "Mostrar o motivo ao cliente".
    const notes = pro ? proNotesOn(pro, iso) : null;
    if (pro && notes && (notes.off || notes.day.windows.length === 0)) {
      const a = notes.off || notes.special ? proAbsenceAnswer(pro, iso, label) : null;
      if (a) return a;
    }
    const asked = askedTimeOf(q);
    const blockedAsk = pro && notes && asked ? notes.blocks.find((b) => inRanges(asked, b.ranges)) : undefined;
    const lines = linesOn(iso);
    const when = `${label}${period ? ` à ${period === 'manha' ? 'manhã' : 'tarde'}` : ''}`;
    if (pro && blockedAsk) {
      const why = sharedReasonOf(blockedAsk);
      return {
        text: `${label} às ${asked}, ${pro.name} não atende${why ? ` (${why})` : ''}.${lines.length ? ` Tenho ${lines.join(' · ')}. Quer que eu reserve um?` : ' Quer que eu veja outro dia?'}`,
        source: `${absenceSource(pro, why)} · horários livres (regra única)`
      };
    }
    // Horário especial do profissional: o motivo marcado entra junto dos horários; sem marcação, nada muda na resposta.
    const specialWhy = pro && notes?.special ? sharedReasonOf(notes.special) : '';
    const blocksWhy = pro && notes && !lines.length ? notes.blocks.map(sharedReasonOf).filter(Boolean).join('; ') : '';
    return lines.length ?
    { text: `${when} tenho ${lines.join(' · ')}${specialWhy ? ` (horário especial de ${pro!.name}: ${specialWhy})` : ''}. Quer que eu reserve um?`, source: specialWhy ? `Agenda · horários livres (regra única) · motivo marcado para o cliente` : 'Agenda · horários livres (regra única)' } :
    { text: `${when} não tenho horário livre${pro ? ` com ${pro.name}` : ''}${blocksWhy ? ` (${blocksWhy})` : ''}. Quer que eu veja outro dia?`, source: blocksWhy ? 'Agenda · horários livres (regra única) · motivo marcado para o cliente' : 'Agenda · horários livres (regra única)' };
  }

  // 7) funcionamento (horário da semana e datas especiais) — o cadastro vence qualquer pergunta do Conhecimento
  // Revisão do G1: com serviço citado ou em foco, "como funciona?" sem dia/horário é sobre o serviço, não sobre o expediente.
  const aboutService = !!svc && has(q, /(como funciona|como e\b)/) && !has(q, /(horario|abre|aberto|fecha|sabado|domingo|feriado|hoje|amanha|\d{1,2}\/\d{1,2})/);
  if (!aboutService && has(q, /(abre|abrem|aberto|fecha|funciona|funcionam|atendem|horario de atendimento|que horas|qual o horario|qual horario|feriado|sabado|domingo)/) && (has(q, /(abre|aberto|fecha|funciona|horario|que horas|feriado|sabado|domingo)/) || dateOf(q))) {
    // "Atendem sábado?" (sem data): a regra da semana para esse dia + aberturas especiais que vêm por aí.
    const wdi = WEEKDAYS.findIndex((d) => q.includes(d));
    if (wdi >= 0 && !has(q, /(\d{1,2}\/\d{1,2}|hoje|amanha|esse|este|proxim|dia )/)) {
      const name = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][wdi];
      const h = getTeam().hours.find((x) => x.day === name);
      const specials = getTeam().blocks.filter((b) => b.date >= TODAY_ISO && wd(b.date) === wdi && b.kind === 'open').map((b) => `${dm(b.date)} (${b.from ?? ''}${b.to ? ` às ${b.to}` : ''})`);
      const base = h?.open ? `Aos ${WEEKDAY_LABEL[wdi]}s atendemos ${periodsText(clinicPeriods(h))}.` : `Aos ${WEEKDAY_LABEL[wdi]}s normalmente não abrimos.`;
      return { text: `${base}${specials.length ? ` Abertura especial: ${joinAnd(specials)}.` : ''}`, source: 'Funcionamento · horário da semana e datas especiais' };
    }
    const iso = dateOf(q);
    if (iso) return dayAnswer(iso, has(q, /feriado/) ? `No feriado de ${dm(iso)},` : iso === TODAY_ISO ? 'Hoje' : `Em ${dm(iso)} (${WEEKDAY_LABEL[wd(iso)]}),`);
    const hours = getTeam().hours;
    const open = hours.filter((h) => h.open);
    const text = open.length ? open.map((h) => `${h.day}: ${rangesText(clinicPeriods(h)).replace(/–/g, ' às ').replace(/, /g, ' e ')}`).join(' · ') : '';
    // G3 (F-058): abertura especial com o motivo só se for público; senão, só a data e o horário.
    const specials = getTeam().blocks.filter((b) => b.date >= TODAY_ISO && b.kind === 'open').map((b) => `${dm(b.date)} (${publicReasonOf(b) || `${b.from ?? ''}${b.to ? ` às ${b.to}` : ''}`})`);
    return text ? { text: `Atendemos ${text}.${specials.length ? ` Abertura especial: ${joinAnd(specials)}.` : ''}`, source: 'Funcionamento · horário da semana e datas especiais' } : TEAM(undefined, 'Horário de funcionamento não cadastrado: passa para a equipe');
  }

  if (!svc && has(q, /(online|video|remot|distancia)/)) {
    const act = ctx.services.filter((x) => x.active);
    const online = act.filter((x) => x.modality === 'online').map((x) => x.name);
    return { text: online.length ? `Fazemos online: ${joinAnd(online)}. Os outros atendimentos são presenciais.` : `Os atendimentos são presenciais, na ${e.name}.`, source: 'Serviços · modalidade de cada serviço' };
  }

  // 8) serviço: diferença entre dois, um serviço citado, ou serviço que não existe no cadastro
  if (cited.length >= 2 && has(q, /(diferenca|diferente|melhor|ou)/)) {
    const [a, b] = cited;
    const da = a.knowledge.description.trim();
    const db = b.knowledge.description.trim();
    if (!a.active || !b.active || !da || !db) return TEAM(undefined, `Serviços: ${a.name} e ${b.name} · falta descrição: passa para a equipe`);
    return { text: `${a.name}: ${da} ${b.name}: ${db} Qual combina mais com você quem atende confirma na avaliação.`, source: `Serviços: ${a.name} e ${b.name} · descrição` };
  }
  if (svc) {
    const r = serviceIntent(q, svc, ctx, cited.length > 0);
    if (r) return r;
  }
  const unknownService = askedObject(q) ? q.match(/\b(fazem|faz|tem|oferecem|trabalham com)\s+([a-z ]{4,})/) : null;
  if (!cited.length && unknownService && !has(q, /(estacionamento|wifi|cafe|banheiro|nota|recibo|desconto|horario|vaga)/))
  {
    // Mostra o nome como o cliente escreveu (com acento), não a forma normalizada.
    const raw = question.toLowerCase().match(/\b(fazem|faz|tem|têm|oferecem|trabalham com)\s+([^?.!]{3,})/)?.[2]?.trim() ?? unknownService[2].trim();
    return TEAM(`Não temos ${raw} no nosso cadastro de serviços. Vou pedir para alguém da equipe te responder.`, 'Serviço não cadastrado: não é oferecido, passa para a equipe');
  }

  // 9) Conhecimento (o que não está em outro cadastro)
  const words = (t: string) => [...new Set(norm(t).split(' ').filter((w) => w.length > 3 && !STOP.has(w)))];
  const faq = ctx.knowledge.
  filter((f) => f.question.trim() && f.answer.trim()).
  map((f) => ({ f, score: words(f.question).filter((w) => q.includes(w)).length })).
  sort((a, b) => b.score - a.score)[0];
  if (faq && faq.score >= 1) return { text: faq.f.answer.trim(), source: `Conhecimento · "${faq.f.question.trim()}"` };

  // Revisão do G1: a descrição só responde quando a pergunta CITA o serviço. Com o serviço só em foco, pergunta sem
  // resposta cadastrada passa para a equipe (nada de responder outra coisa com a descrição).
  // Revisão do G1 (F-011): só quando a pergunta é o próprio serviço ("Limpeza de pele?"), sem pedir outro atributo.
  const named = cited[0];
  if (named && named.active && named.knowledge.description.trim() && attributeWords(q, named).length === 0) return { text: named.knowledge.description.trim(), source: `Serviço: ${named.name} · descrição` };
  return TEAM();
}

const STOP = new Set(['voces', 'vocês', 'como', 'qual', 'quais', 'para', 'quanto', 'quando', 'onde', 'esse', 'essa', 'isso', 'aqui', 'tenho', 'fazer', 'depois', 'antes']);

/* ───────────── Conhecimento: o que a assistente já sabe pelo cadastro (F-010) ───────────── */

/**
 * Assunto que já tem cadastro próprio. Uma pergunta do Conhecimento sobre ele é avisada: a assistente responde pelo cadastro
 * (o FAQ não muda o cadastro). Ex.: "Atendem aos sábados?" → Funcionamento.
 */
export type RegistryTopic = {id: string;label: string;to: string;};
export function registryTopicOf(question: string): RegistryTopic | null {
  const q = norm(question);
  if (has(q, /(sabado|domingo|feriado|horario|abre|fecha|funcionamento|que horas)/)) return { id: 'funcionamento', label: 'Funcionamento', to: '/servicos-equipe?aba=funcionamento' };
  if (has(q, /(pagamento|pagar|pix|cartao|parcel|desconto|sinal|dinheiro)/)) return { id: 'pagamento', label: 'Empresa › Pagamento', to: '/atendente-ia/empresa?campo=pagamento' };
  if (has(q, /(convenio|plano de saude)/)) return { id: 'convenio', label: 'Empresa › Convênio', to: '/atendente-ia/empresa?campo=pagamento' };
  if (has(q, /(endereco|onde fica|localizacao)/)) return { id: 'endereco', label: 'Empresa › Endereço', to: '/atendente-ia/empresa' };
  if (has(q, /(quanto tempo|dura|duracao|preco|quanto custa|avaliacao)/)) return { id: 'servico', label: 'Serviços e equipe › Serviços', to: '/servicos-equipe?aba=servicos' };
  if (has(q, /(cancel|remarc|falt)/)) return { id: 'politicas', label: `Empresa › Regras ${wordsNow().of}`, to: '/atendente-ia/empresa?campo=politica-cancelamento' };
  return null;
}

/** Contradição clara entre a resposta do FAQ e o Funcionamento (sábado/domingo). */
export function funcionamentoConflict(question: string, answer: string): string | null {
  const q = norm(question);
  const a = norm(answer);
  const day = q.includes('sabado') ? 'Sábado' : q.includes('domingo') ? 'Domingo' : null;
  if (!day) return null;
  const h = getTeam().hours.find((x) => x.day === day);
  if (!h) return null;
  const saysNo = /\b(nao|fechad)/.test(a);
  const saysYes = /\b(sim|abrimos|atendemos|aberto)\b/.test(a) && !saysNo;
  if (h.open && saysNo) return `O Funcionamento diz que ${day.toLowerCase()} ${wordsNow().the} abre (${rangesText(clinicPeriods(h)).replace(/–/g, ' às ').replace(/, /g, ' e ')}). A assistente responde pelo Funcionamento.`;
  if (!h.open && saysYes) return `O Funcionamento diz que ${day.toLowerCase()} ${wordsNow().the} não abre. A assistente responde pelo Funcionamento.`;
  return null;
}