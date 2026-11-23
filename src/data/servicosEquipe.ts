/**
 * Serviços e equipe — só o que a PÁGINA precisa (abas e textos fixos).
 *
 * G1 (23/10/2026, F-016): as listas de serviços (`serviceCategories`) e de profissionais (`professionals`) que viviam
 * aqui foram removidas. Serviços: data/servicesStore.ts (semente em data/servicesSeed.ts). Equipe: data/availability.ts
 * (`getTeam().members`, semente em data/equipeFuncionamento.ts). Prazo de retorno: `followUp` do serviço (data/returns.ts).
 */
export const servicosEquipeTabs = [
{ value: 'servicos', label: 'Serviços' },
// CONTRATO NOVO (aulas em grupo, 23/11/2026): só aparece com um serviço em grupo ativo (pages/ServicosEquipe.tsx).
{ value: 'turmas', label: 'Turmas' },
{ value: 'equipe', label: 'Equipe' },
{ value: 'funcionamento', label: 'Funcionamento' }];


export const returnHelpText = 'A assistente lembra o cliente de voltar quando o prazo vencer.';