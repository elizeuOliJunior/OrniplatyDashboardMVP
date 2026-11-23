# components/v319 — OBSOLETA (06/11/2026)

As peças que viviam aqui como cópia local (T1 1a–1p, 04–05/11/2026) foram levadas ao design system ORNIPLATY e publicadas
como **v4.0** (06/11/2026, OK do Christian). O Painel agora importa todas de `../Card`:
ConversationListItem, ConversationHeader (+ HeaderIconAction), Composer (+ `addReplyDisabledReason`, A-38), MessageBubble
(`MessageThread appearance="panel"`), ContextCard (+ ContextPanel/Section/OpenArea), StatusBadge (+ `truncate`), StatusDot,
StatChip, ReminderStatusRow, AppointmentSummaryCard, Toast (`useToast`), Banner (= `Alert layout="banner"`).
`components/ui/ScrollableTabs.tsx` voltou a só repassar o DS.

Os arquivos desta pasta ficaram só com um comentário e `export {}` (a ferramenta não apaga arquivos). Não importe nada daqui.
Continuam locais no Painel: `ui/ThemeHost` (modo escuro provisório), `ui/TooltipEdgeGuard`, `conversas/TemplatePicker`, `conversas/QuickReplyForm`.
