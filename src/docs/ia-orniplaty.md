# IA Orniplaty (antes "Atendente IA") — convenções (19/10/2026)

LEIA ANTES DE MEXER NAS TELAS `/atendente-ia/*`. Complementa o CLAUDE.md.

## Decisões do Christian (C1–C8, 19/10/2026)
- C1: aba Nível de IA saiu do Painel até a definição comercial; `/atendente-ia/nivel` redireciona para Empresa (`pages/AtendenteIaNivel.tsx` só redireciona). O Onboarding não mudou.
- C2: nenhum texto de "simulação", "protótipo", "demonstração" ou "teste" nas telas da IA Orniplaty (toasts inclusive). Aviso interno só no seletor de telas. As OUTRAS telas do Painel ainda têm esses textos (decisões das etapas 3–7): não remover sem pedido.
- C3: Documentos ficam, com a explicação real (a assistente lê o texto; foto e PDF escaneado não) e estados Lendo / Pronto / Não lido (`DOC_STATUS` em `data/conhecimento.ts`).
- C4: campos novos (contrato de backend a criar): endereço completo, convênios aceitos, política de falta. Preparo e avaliação por serviço: registrar para Serviços e equipe (não feito).
- C5: (ATUAL, G4) segmento Clínica · Salão/Barbearia · Consultório · Outro + especialidade (Clínica e Consultório) nos DOIS projetos, por `data/segment.ts` compartilhado. Palavras, exemplos, sugestões de instruções e perguntas, serviços de exemplo e a pergunta de convênio seguem o segmento (`segmentContent`). Antes: só clínica no Painel e lista antiga no Onboarding.
- C6: menu "IA Orniplaty"; ícone `OrniMarkIcon` (silhueta da logo) depende de publicação do design system + Update. Até lá o menu usa `BotIcon`.
- C7: regras de segurança das campanhas: 09:00–20:00, máx. 2 mensagens automáticas por cliente por mês, quem saiu não recebe. (HISTÓRICO: o limite "2 por mês" saiu no Lote B; desde o G1 vale "duas tentativas seguidas sem resposta → Precisa de você", ver CT-14 abaixo.)
- C8: confirmação na véspera com 12, 24 ou 48 h (padrão 24). O backend hoje só faz 24 h fixas.

## Estrutura
- Menu abre em `/atendente-ia/empresa` (`sidebarRoutes`). Abas: Empresa, Como atender, Conhecimento, Automações.
- `ReadinessCard` (topo de todas as abas): "Sua assistente conhece X de 10 itens", conta só o que está SALVO; cada linha leva ao campo com `?campo=<id>` (tratado em `AtendenteIaLayout`). Exemplo inicial 8/10 desde o G1 (os itens de Serviços e equipe passaram a ser calculados); a lista tem 10 itens (inclui "Regras de cancelamento e falta"). Desde o G1 (subetapa 1), "Serviços com preço", "Horário de funcionamento" e "Profissionais" são calculados de Serviços e equipe (serviço ativo com preço ou sob consulta; pelo menos um dia aberto; pelo menos um profissional ativo).
- Salvo por aba em stores de módulo (`data/iaConfigStore.ts`): `empresaStore`, `atendimentoStore`, `conhecimentoStore`, `automacoesStore` (o modo de envio mora só em `automacoesStore.mode`; `data/automationMode.ts` é atalho para ler/escrever esse campo, G1). O rascunho continua no `useDraft`; voltar à aba mostra o salvo.
- Peças locais montadas só com o design system: `components/atendente-ia/FormParts.tsx` (FieldLabel com InfoTip, SectionCard, ExampleHint, StickySaveBar) e `WhatsAppPreview.tsx` (MessageThread/MessageBubble com o nome atual da assistente em cada balão).
- Como atender: apresentação acompanha o nome até ser editada (`greetingEdited`), "Restaurar texto sugerido" com confirmação; limites e "quando chamar" em pílulas iguais ao Onboarding; "Gerar sugestão" monta texto a partir de Empresa (o backend real tem `POST /api/tenant/ai-config/suggest-prompt`).
- Automações: nomes ATUAIS (Lote B, iguais no Onboarding desde o G4): Confirmar o horário · Oferecer vaga para a lista de espera · Lembrar o cliente de voltar · Chamar quem faltou · Retomar quem pediu preço · Lembrar sessões de pacote · Chamar quem sumiu; ids internos mantidos. Pacotes: a mensagem "Em análise" na Meta não envia sozinha (B8); "Ver clientes em Oportunidades" no cartão. A assistente NÃO oferece pacote nem renovação sozinha (AQ-03): informa saldo verificado e passa pedido de compra para a equipe.

## Guarda de alterações: troca de aba (vale para todo o Painel)
- Clicar/teclar outra aba com alterações mostra "Descartar e sair" / "Salvar e sair"; os dois levam à aba clicada (`leaveToTab` em `data/dirtyGuard.ts`). Menu e links continuam com "Descartar alterações" / "Salvar e continuar" (salva e segue para o destino).

## Divergências conhecidas
- Configurações › Conta já tem o WhatsApp de avisos (19) 98811-4420; Como atender tem o campo próprio "WhatsApp que recebe o aviso" (vazio no exemplo). Unificar na integração.
- Backend (pendências para o Elizeu): dois nomes da assistente no prompt; emoji nas mensagens fixas de encaminhamento; upload aceita 50 mil caracteres mas o schema limita a 5 mil; lembrete sem janela de horário; `quando_escalar` é texto livre; lista de espera, campanhas, retomada, retorno com envio, modo Supervisionado, limite por cliente e opt-out não existem.

## Lote E (22/10/2026): liga/desliga, prontidão, Empresa, textos de ajuda
Decisões do Christian: D1 cartão de estado + confirmação, escolhendo o que para; D2 parcelamento, desconto à vista e sinal (formas continuam Pix, crédito, débito, dinheiro); D3 prévias mostram o que o CLIENTE vê; D4 Instagram, Facebook, site e até 3 links com nome. Design system v3.14 (MessageThread `perspective`, `completionTone`/`consumptionTone`, `SocialIcon`, regras em owner-config-screens e logo-usage) e v3.15 (StepProgress com a leitura de conclusão, pedido do Christian).
- Estado da assistente: `data/settingsStore.ts` (`ai`). Peças: `components/atendente-ia/AssistantPower.tsx`.
- Prontidão: `useReadiness()` em `ReadinessCard.tsx` (também usada na confirmação de ligar).
- Empresa: `data/empresa.ts` (`ClinicLinks`, `PaymentDetails`, `paymentErrors`, `paymentAnswer`, `paymentInstructions`, `linkErrors`, `isMapsLink`, `migrateLinks`).
- Barra do rodapé do menu: continua sempre verde (decisão do Christian, 22/10/2026).
- Divergências registradas: a confirmação de ligar no primeiro acesso usa a prontidão dos dados de exemplo do Painel, não a configuração recebida do Onboarding; o Onboarding ainda tem só as pílulas de pagamento, prévias com a visão da clínica e a barra de etapas sem cor por conclusão (rodada de alinhamento).

### Pendências do backend (Lote E, para o Elizeu)
- Parar lembretes e campanhas junto com a IA: hoje `ai_enabled` (ai/gate.py) só silencia respostas; lembretes de horário não consultam o botão.
- Pagamento: `formas_pagamento` é texto de 200 caracteres. SUBSTITUÍDO pelas pendências do Lote F (abaixo): sem parcela mínima e com regra por serviço.
- Links: `links_uteis` é texto de 500. Separar Instagram, Facebook, site e links com nome, ou montar o texto "Instagram: … / Facebook: … / Site: … / {nome}: …".
- Convênio e política de falta: sem campos próprios.
- Especialidade: não existe no backend (só `segmento`, 30 caracteres).
- Avisos de uso: os percentuais 80% e 95% não foram encontrados no código (notifications/owner_alert.py); a tela não cita números até confirmar.
- Documentos: o backend lê só .txt, .pdf e .docx até 10 MB (ai/document_parser.py); o protótipo deixou de aceitar .doc.

## Lote F (22/10/2026): pagamento e convênio, padrão da empresa + diferente neste serviço
Decisões P1–P7 do Christian. Design system v3.16 (`PillLink`). Detalhes no CLAUDE.md (seção "Pagamento e convênio").
- Empresa › "Pagamento e convênio" em 4 blocos: Formas · Regras que valem para todos os serviços (+ quadro "Serviços com regra diferente", que abre o serviço por cima da Empresa) · Como o cliente paga (um campo só, 300) · Convênio (Não · Sim, lista, "Por padrão, os serviços atendem convênio?", "Atendem convênio: x de y").
- A exceção mora no serviço (aba Pagamento). Regra que vale: `effectivePayment` em `data/paymentRules.ts` (fonte única para prévias, Testar como cliente, Gerar sugestão, resumos e prontidão).
- Prévias de seção acompanham a rolagem no computador (`SectionCard` com `lg:sticky`): Empresa e Como atender. Conhecimento tem a prévia dentro de uma janela.
- Saíram: Parcela mínima, "Para quais serviços?" do sinal, "Como o cliente paga o sinal" e "Algo mais sobre pagamento".

### Pendências do backend (Lote F, para o Elizeu)
- Padrão de pagamento no tenant: parcelamento (máximo, sem juros até), desconto à vista (% e formas), sinal (fixo/%), como o cliente paga (300), convênio padrão (todos/marcados) e lista de convênios.
- Regra por serviço nas 4 regras (padrão ou própria; convênio: particular, todos ou só alguns).
- Prompt da IA lendo a regra de cada serviço (hoje lê só `formas_pagamento` e "nome: R$ preço (duração) — descrição").
- `formas_pagamento` (200 caracteres) não comporta nada disso. A parcela mínima do Lote E saiu (não pedir mais esse campo).
- Ajustes (22/10/2026): "Público atendido" saiu (cartão "Links da clínica"); ícones de Instagram e Facebook nas cores da marca (DS v3.17); prévias continuam na visão do cliente (confirmado).

## G1 · subetapas 2, 3 e 4 (25/10/2026, fork 4dvp3mm8; aprovado pelo Christian)
Rótulos: [protótipo] = feito no Magic Patterns · [requisito] = contrato para a integração (NÃO implementado no backend nem no front real) · [histórico] = referência antiga, não reconferida.

### Fontes da assistente na prévia (F-010/F-011/F-012) [protótipo]
`data/assistantAnswer.ts` (`answerQuestion`) responde por INTENÇÃO e diz a fonte ("Ela responde com base em: …"):
| Assunto | Fonte | Sem a informação |
|---|---|---|
| Horário, sábado, feriado, data | Funcionamento (`clinicDay`: semana + datas especiais) | passa para a equipe |
| Horário livre, "tem vaga", dias do profissional | Agenda (`freeStartTimes`, `effectiveDayById`, regra única) | "não tenho horário livre" (nada inventado) |
| Endereço, links, pagamento, convênio | Empresa (`effectivePayment`, `clinicAnswer`, lista de convênios) | passa para a equipe; convênio fora da lista não é prometido |
| Preço, sob consulta, duração, quem faz, preparo, cuidados, inclui, contraindicação, avaliação, sinônimos, "O que não dizer" | Serviço (só ATIVO; avaliação só com serviço de avaliação ativo) | passa para a equipe; arquivado = "não estamos oferecendo" |
| Cancelar/remarcar, faltei | Políticas da Empresa (`cancellationPolicy`, `noShowPolicy`) | sem multa inventada: passa para a equipe |
| Saldo do pacote | Vendas (`listPackages`) do cliente identificado | passa para a equipe |
| Preço/compra de pacote, pessoa, áudio/foto, menores, outra unidade, lista de espera | — | sempre a equipe |
| O resto | Conhecimento (FAQ) | passa para a equipe |
Precedência (revisão do G1, 25/10/2026): "fazem/tem/oferecem X?" só confirma o serviço quando ele é CITADO; com o serviço só em foco (testador do serviço) e X não cadastrado, vale o guarda "não temos X" (equipe). A descrição do serviço só responde pergunta que cita o serviço; sem resposta cadastrada, passa para a equipe. Serviço arquivado (citado ou em foco) não ganha horário oferecido. "Manhã" e "tarde" são palavras inteiras ("amanhã" não é manhã). Com serviço em foco, "Como funciona?" sem dia ou horário fala do serviço.
Atributo de serviço (revisão do G1, 2ª rodada): identificar o serviço não confirma o que foi perguntado sobre ele ("A limpeza de pele tem/usa anestesia?"). O atributo só é respondido por uma fonte cadastrada: pergunta frequente do serviço ou do Conhecimento (casadas pelas palavras do assunto, nunca pelo nome do serviço); sem fonte, "Não tenho essa informação aqui" e passa para a equipe. "Fazemos sim" só quando a pergunta não pede nada além do serviço. A descrição responde pedido de explicação ("como funciona", "o que é", "me conta") ou a pergunta que é só o serviço. Pergunta frequente do serviço que bate por completo vence as regras genéricas de duração e preço.
Bateria Q01–Q40 + R01–R15 + S01–S15: evidência de FUNÇÃO no relatório. Nível de IA continua escondido no Painel.
[requisito] O prompt real (prompts.py, [histórico]) precisa ler as mesmas fontes por serviço e a política de falta; mídia (áudio/foto) sem capacidade afirmada até validação.

### CT-14 — Acompanhamento e campanhas [requisito]
(Alias: material antigo chamava a janela de envio de "CT-13"; é a mesma regra, registrada só aqui.)
- Janela das campanhas: 09:00–20:00, segunda a sábado; respostas da assistente e confirmação de horário fora dessa regra.
- Mensagens do mesmo cliente no mesmo dia, de processos diferentes, viram um envio (uma tentativa).
- Tentativa = mensagem que SAIU (envio automático, aprovado e enviado, ou registrado como feito pela equipe). Fica sem resposta às 20:00 do próximo dia de envio permitido. Duas tentativas seguidas sem resposta, somando os processos do cliente → "Precisa de você" e nada mais sai sozinho; só resposta do cliente ou decisão explícita da clínica libera, e a decisão vale para a tentativa escolhida.
- Ligação explícita caso → agendamento (`follow_up_case_id`) e desfecho "Voltou" só com pagamento recebido; semelhança só como "agendou".
- F-019: origem/início de contato ≠ consentimento por finalidade. Histórico preservado, nada vira consentimento automaticamente, ausência de opt-out não autoriza campanha, retirar bloqueio não cria consentimento. Validação jurídica pendente.

### CT-18 — Resultados [requisito]
- Recebimentos pela data de cada pagamento (`received_date`), inclusive coparticipação, repasse, parcela de pacote; reembolso como saída na data (`FinancialRefund` [histórico], só achado no cancelamento de pacote).
- Ticket médio = valor pago ÷ fechamentos pagos do mesmo período; convênio quando quitado (último recebimento); reembolso reduz o fechamento (decisões E1/E2 do Christian).
- "Gerado pela IA": `source=whatsapp` + `created_actor_type=ai_whatsapp`, `completed` e `received`, com lista. Clientes recuperados distintos. Horário cancelado, faltado ou ainda aberto não conta, mesmo com o dinheiro recebido; o dinheiro continua em Recebimentos (revisão do G1).
- Conversas com data (hoje o protótipo só tem hora): sem isso, o indicador fica indisponível.

### Notas de contrato do G1 (só documentação) [requisito]
- F-018: nível de IA escondido; OB07 "Disponível em breve", sem seleção; o Onboarding não deve mandar nível fixo. [histórico] backend com LEVEL_1/2/3, padrão LEVEL_2, GET/PATCH restritos. Nada implementado aqui.
- F-020: intervalo entre agendamentos padrão 0 em todos os caminhos de criação, preservando valores já configurados. [histórico] o padrão do backend era diferente; não afirmamos que foi corrigido.
- F-021: tom padrão "Humanizada" no backend, front e chatbot. Não afirmamos que o padrão antigo mudou.
- F-022: grade, antecedência, janela e dias oferecidos configuráveis (Funcionamento › Regras de agendamento é só proposta; salvar no protótipo não cria função no backend).

## G3 (26/10/2026, prévia no fork 1fgsse2y): horário e motivo visível ao cliente
- Horário da clínica com vários períodos no dia: a prévia responde "das 08:00 às 12:00 e das 14:00 às 18:00" (`dayAnswer`, resumo semanal e contradição do FAQ leem `clinicPeriods`).
- Motivo de data especial e de ausência é INTERNO por padrão. A prévia diz só "a clínica não abre" (ou o horário) e mostra entre parênteses apenas `publicWhy`: o nome oficial de feriado nacional (`publicLabel`, informação pública) ou o motivo marcado com "Mostrar o motivo ao cliente" (`reasonShared`). Texto livre nunca vira público por a data ser feriado (D5).
- Abertura extraordinária com motivo oculto: a prévia cita só a data e o horário.
- [requisito G6] `reason_shared_with_client` e nome público por data especial/ausência; o prompt real deve ler o mesmo campo, nunca a nota interna.


## G4 · estados, textos e segmento (27/10/2026; prévia no fork, NÃO aplicada ao original)
- Resumo ÚNICO do estado da conta: `accountSummary()` (data/settingsStore.ts) para Início, cartão da IA Orniplaty, Conversas, Configurações › Visão geral e Automações. Limite do mês, cartão recusado e WhatsApp sem funcionar dizem "A assistente parou: …" com a mesma ação; "Tudo certo" só sem pendência e sem ponto de atenção.
- Demonstração de tom (`toneDemosFor`): usa o primeiro serviço ativo e quem faz (ou o exemplo do segmento) e a antecedência SALVA da confirmação ("na véspera" só com 24 h; confirmação desligada = sem lembrete). Sem emoji. Arquivo `data/toneDemos.ts` agora é idêntico ao do Onboarding.
- Conhecimento: documento só fica "Lido" se o arquivo tem conteúdo legível (`isReadableDocument`); senão "Não lido" com o motivo.
- Sugestões (Como atender e Conhecimento) por segmento e especialidade (`segmentContent`), inclusive Consultório (6 especialidades), Salão/Barbearia e Outro (neutro).
- Pagamento: "preço a definir" onde o catálogo comercial não existe (sem preço inventado).
