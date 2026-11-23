import { createSavedStore } from './iaConfigStore';

export type KnowledgeEntry = {
  id: string;
  question: string;
  answer: string;
};

/**
 * Estado da leitura do arquivo (decisão C3, 19/10/2026): o sistema real lê o texto de PDF, Word e TXT.
 * Fotos e PDF escaneado não têm texto e ficam "Não lido".
 */
export type DocStatus = 'lendo' | 'pronto' | 'nao-lido';

export type KnowledgeDocument = {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'docx' | 'txt';
  status?: DocStatus;
};

export const knowledgeNotice =
'A assistente responde usando as perguntas e respostas abaixo, os documentos lidos e o cadastro da clínica. O que não estiver aqui, ela não inventa: chama sua equipe.';

/** Compatibilidade com código antigo. */
export const documentStatusText = 'A assistente já usa este conteúdo';

export const DOC_STATUS: Record<DocStatus, {label: string;tone: 'neutral' | 'success' | 'warning';text: string;}> = {
  lendo: { label: 'Lendo', tone: 'neutral', text: 'Lendo o texto do arquivo…' },
  pronto: { label: 'Pronto', tone: 'success', text: 'A assistente já usa este conteúdo.' },
  'nao-lido': {
    label: 'Não lido',
    tone: 'warning',
    text: 'Não encontramos texto neste arquivo. Envie uma versão com texto ou cadastre como pergunta e resposta.'
  }
};

/** O que vale enviar como documento. */
export const DOC_GUIDE = [
{ title: 'Tabela de preços', text: 'Valores, pacotes e formas de pagamento por serviço.' },
{ title: 'Política da clínica', text: 'Cancelamento, atrasos, faltas e reembolsos.' },
{ title: 'Guia de preparo e cuidados', text: 'O que fazer antes e depois de cada procedimento.' }];


/**
 * Perguntas comuns por segmento (adicionar com um clique; entram sem resposta).
 * G1 subetapa 4 (F-010): só assuntos que NÃO têm cadastro próprio. Horário, pagamento, convênio, endereço, preço, duração e
 * avaliação a assistente já sabe pelo cadastro (Funcionamento, Empresa, Serviços); a tela também filtra por `registryTopicOf`.
 */
export const QUESTION_SUGGESTIONS: Record<string, string[]> = {
  estetica: ['Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Posso levar acompanhante?', 'Vocês vendem os produtos usados no atendimento?'],
  odontologia: ['Atendem urgência?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Tem acessibilidade para cadeira de rodas?'],
  'clinica-medica': ['O que levar à consulta?', 'Fazem retorno sem custo?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?'],
  fisioterapia: ['Precisa de pedido médico?', 'Que roupa devo usar na sessão?', 'Vocês têm estacionamento?', 'Emitem nota fiscal?'],
  psicologia: ['Qual a frequência das sessões?', 'O que é conversado fica em sigilo?', 'Emitem recibo para reembolso do plano?', 'Vocês têm estacionamento?'],
  'salao-barbearia': ['Vocês têm estacionamento?', 'Posso levar o meu produto?', 'Emitem nota fiscal?', 'Atendem por ordem de chegada?'],
  outro: ['Vocês têm estacionamento?', 'Emitem nota fiscal?', 'Tem acessibilidade para cadeira de rodas?']
};

export const knowledgeEntries: KnowledgeEntry[] = [
{ id: 'estacionamento', question: 'Vocês têm estacionamento?', answer: 'Sim, estacionamento gratuito no subsolo do prédio.' },
{ id: 'pagamento', question: 'Quais formas de pagamento vocês aceitam?', answer: 'Pix, cartão de crédito e cartão de débito.' },
{
  id: 'avaliacao',
  question: 'Precisa de avaliação antes do procedimento?',
  answer: 'Para toxina botulínica e peeling químico, sim. A avaliação é feita com a Dra. Carolina.'
},
{
  id: 'sabados',
  question: 'Atendem aos sábados?',
  answer: 'Normalmente não. Abrimos em alguns sábados especiais, e eu aviso quando houver horário.'
}];


export const knowledgeDocuments: KnowledgeDocument[] = [
{ id: 'tabela-precos', name: 'tabela-precos-2026.pdf', size: '240 KB', type: 'pdf', status: 'pronto' },
{ id: 'regulamento', name: 'regulamento-pacotes.docx', size: '88 KB', type: 'docx', status: 'pronto' },
{ id: 'folheto', name: 'folheto-escaneado.pdf', size: '1,2 MB', type: 'pdf', status: 'nao-lido' }];


export type ConhecimentoConfig = {items: KnowledgeEntry[];docs: KnowledgeDocument[];};

export const conhecimentoStore = createSavedStore<ConhecimentoConfig>({ items: knowledgeEntries, docs: knowledgeDocuments });

/** Perguntas que a assistente realmente usa (com resposta). */
export const answeredCount = (items: KnowledgeEntry[]) => items.filter((i) => i.question.trim() && i.answer.trim()).length;

/** Mínimo recomendado no cartão de prontidão. */
export const MIN_ANSWERED = 5;