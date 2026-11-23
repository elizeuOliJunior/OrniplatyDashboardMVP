/**
 * Palavra de cada dia de uma turma (lote G5, aulas em grupo, 23/11/2026; CONTRATO NOVO).
 *
 * Cada serviço do tipo "Turma" escolhe como chama cada dia da turma, numa lista fechada (sem texto livre):
 * Aula, Treino, Oficina, Reunião, Sessão, Encontro. Padrão: Encontro. Fica em `ServiceGroup.word` (data/servicesStore.ts).
 * Mesmo jeito das palavras da empresa (`wordsNow` em data/segment.ts, que NÃO muda): as formas prontas que os textos usam,
 * com o gênero certo ("esta aula" / "este treino").
 *
 * Regra das palavras (G5):
 *  - texto sobre UM dia de UM serviço (janela do dia, confirmações, chamada, Ficha): a palavra do serviço (`dayWords`);
 *  - texto que cobre vários serviços ou nenhum: neutro ("Turma lotada.", "Reposição", legenda "Turma");
 *  - mensagem ao cliente: nenhuma dessas palavras, só o nome do serviço ("‹Serviço› de ‹dia›, às ‹hora›, não vai acontecer.").
 */

/** CONTRATO NOVO (aulas em grupo, 23/11/2026): a palavra escolhida no serviço. */
export type TurmaWordId = 'aula' | 'treino' | 'oficina' | 'reuniao' | 'sessao' | 'encontro';

export const TURMA_WORD_DEFAULT: TurmaWordId = 'encontro';

type Base = {label: string;g: 'f' | 'm';one: string;many: string;};

const BASE: Record<TurmaWordId, Base> = {
  aula: { label: 'Aula', g: 'f', one: 'aula', many: 'aulas' },
  treino: { label: 'Treino', g: 'm', one: 'treino', many: 'treinos' },
  oficina: { label: 'Oficina', g: 'f', one: 'oficina', many: 'oficinas' },
  reuniao: { label: 'Reunião', g: 'f', one: 'reunião', many: 'reuniões' },
  sessao: { label: 'Sessão', g: 'f', one: 'sessão', many: 'sessões' },
  encontro: { label: 'Encontro', g: 'm', one: 'encontro', many: 'encontros' }
};

/** Ordem da lista na janela do serviço. */
export const TURMA_WORD_OPTIONS: {value: TurmaWordId;label: string;}[] = (['aula', 'treino', 'oficina', 'reuniao', 'sessao', 'encontro'] as TurmaWordId[]).map((id) => ({ value: id, label: BASE[id].label }));

export type DayWords = {
  id: TurmaWordId;
  /** "Aula" */
  label: string;
  g: 'f' | 'm';
  /** "aula" · "aulas" · "Aula" · "Aulas" */
  one: string;
  many: string;
  One: string;
  Many: string;
  /** "a aula" · "A aula" */
  the: string;
  The: string;
  /** "esta aula" · "Esta aula" */
  this: string;
  This: string;
  /** "desta aula" · "nesta aula" */
  of: string;
  in: string;
  /** "da aula" · "na aula" · "à aula" */
  ofThe: string;
  inThe: string;
  toThe: string;
  /** "uma aula" */
  a: string;
  /** escolhe a forma pelo gênero: pick('cancelada', 'cancelado') */
  pick: (f: string, m: string) => string;
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const cache = new Map<TurmaWordId, DayWords>();

/** As formas prontas da palavra (sem palavra ou palavra desconhecida = Encontro). */
export function dayWords(id?: TurmaWordId | null): DayWords {
  const key: TurmaWordId = id && BASE[id] ? id : TURMA_WORD_DEFAULT;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = BASE[key];
  const f = b.g === 'f';
  const pick = (fem: string, masc: string) => f ? fem : masc;
  const w: DayWords = {
    id: key,
    label: b.label,
    g: b.g,
    one: b.one,
    many: b.many,
    One: cap(b.one),
    Many: cap(b.many),
    the: `${pick('a', 'o')} ${b.one}`,
    The: `${pick('A', 'O')} ${b.one}`,
    this: `${pick('esta', 'este')} ${b.one}`,
    This: `${pick('Esta', 'Este')} ${b.one}`,
    of: `${pick('desta', 'deste')} ${b.one}`,
    in: `${pick('nesta', 'neste')} ${b.one}`,
    ofThe: `${pick('da', 'do')} ${b.one}`,
    inThe: `${pick('na', 'no')} ${b.one}`,
    toThe: `${pick('à', 'ao')} ${b.one}`,
    a: `${pick('uma', 'um')} ${b.one}`,
    pick
  };
  cache.set(key, w);
  return w;
}