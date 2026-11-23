import { DEFAULT_ASSISTANT_NAME, assistantDisplayName, isDefaultAssistantName } from './assistantIdentity';
import { DEFAULT_TONE } from './toneDemos';
import { createSavedStore } from './iaConfigStore';
import { businessName } from './empresa';
import { SEGMENT_CONTENT_KEYS, contentOfKey, ofName } from './segment';

/*
 * G1 (23/10/2026, F-004): a constante `CLINIC_NAME` foi REMOVIDA. O nome da empresa nas falas da assistente é o nome salvo
 * em IA Orniplaty › Empresa (`businessName()` de data/empresa.ts). Renomear a empresa muda a apresentação sugerida na hora.
 */

/** Apresentação sugerida: acompanha o nome da assistente e o nome da empresa enquanto a clínica não editar o texto (paridade com o Onboarding). */
export function suggestedGreeting(name: string, company: string = businessName()) {
  const who = isDefaultAssistantName(name) ? DEFAULT_ASSISTANT_NAME : assistantDisplayName(name);
  return `Olá! Sou a ${who}, ${ofName(company)}. Como posso ajudar?`;
}

/** Apresentação que VALE: o texto editado pela clínica ou, se ela nunca editou, a sugestão viva (nome da assistente + empresa). */
export const effectiveGreeting = (cfg: Pick<AtendimentoConfig, 'name' | 'greeting' | 'greetingEdited'>) => cfg.greetingEdited ? cfg.greeting : suggestedGreeting(cfg.name);

/** Limites da assistente (mesmas opções do Onboarding, etapa 5). */
export const CAN_DO_OPTIONS = [
{ value: 'horarios', label: 'Consultar horários da agenda' },
{ value: 'precos', label: 'Informar serviços e preços cadastrados' },
{ value: 'agendar', label: 'Agendar, remarcar e cancelar com confirmação do cliente' },
{ value: 'encaminhar', label: 'Encaminhar dúvidas à equipe' }];


export const CANNOT_DO_OPTIONS = [
{ value: 'diagnostico', label: 'Dar diagnóstico' },
{ value: 'resultado', label: 'Prometer resultado' },
{ value: 'inventar', label: 'Inventar preço ou horário' },
{ value: 'desconto', label: 'Dar desconto sem autorização' }];


/** Quando chamar uma pessoa (mesmas opções do Onboarding, etapa 5). */
export const HANDOFF_OPTIONS = [
{ value: 'pede-pessoa', label: 'Cliente pede para falar com uma pessoa' },
{ value: 'reclamacao', label: 'Reclamação ou situação delicada' },
{ value: 'sem-resposta', label: 'Pergunta que não está no cadastro' },
{ value: 'saude', label: 'Assunto de saúde que precisa de avaliação' }];


export const HANDOFF_CLIENT_MESSAGE = 'Vou passar você para a nossa equipe. Já já alguém responde.';

/** Sugestões de instruções por segmento (adicionar com um clique). */
export const INSTRUCTION_SUGGESTIONS: Record<string, string[]> = Object.fromEntries(
  SEGMENT_CONTENT_KEYS.map((k) => [k, contentOfKey(k).instructions])
);

export type AtendimentoConfig = {
  name: string;
  greeting: string;
  /** A clínica editou a apresentação: ela para de acompanhar o nome sozinha. */
  greetingEdited: boolean;
  tone: string;
  canDo: string[];
  canExtra: string;
  cannotDo: string[];
  cannotExtra: string;
  handoff: string[];
  handoffOther: string;
  /** G1 (F-014): `alertPhone` saiu daqui — o WhatsApp para avisos mora só em data/accountStore.ts (`alertsPhone`). */
  instructions: string;
};

/** Exemplo inicial: WhatsApp de aviso ainda vazio (o cartão de prontidão mostra o que falta). */
export const atendimentoStore = createSavedStore<AtendimentoConfig>({
  name: '',
  greeting: suggestedGreeting(''),
  greetingEdited: false,
  tone: DEFAULT_TONE,
  canDo: CAN_DO_OPTIONS.map((o) => o.value),
  canExtra: '',
  cannotDo: CANNOT_DO_OPTIONS.map((o) => o.value),
  cannotExtra: '',
  handoff: HANDOFF_OPTIONS.map((o) => o.value),
  handoffOther: '',
  instructions: ''
});

/** Compatibilidade com código antigo. */
export const attendantDefaults = {
  name: '',
  greeting: suggestedGreeting(''),
  tone: DEFAULT_TONE as string,
  instructions: '',
  instructionsCounter: '0 / 2.500'
};

export const handoffTriggers = HANDOFF_OPTIONS.map((o) => ({ id: o.value, label: o.label, checked: true }));