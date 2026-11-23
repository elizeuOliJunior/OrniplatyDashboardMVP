import React, { useMemo, useState } from 'react';
import { ChevronRightIcon, SearchIcon } from 'lucide-react';
import { InfoTip, ProfessionalTag, StatusBadge, clickableChevronClass, clickableCardClass } from '../Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../Table';
import { Input } from '../Input';
import { Select } from '../Select';
import { PillGroup } from '../Pill';
import { EmptyState } from '../EmptyState';
import { toolbarClass } from '../ui/styles';
import { groupLabel, isGroupService, kindLabel, knowledgeBadgeLabel, knowledgeStatus, priceLabel } from '../../data/servicesStore';
import { Button } from '../Button';
import type { Category, ServiceItem } from '../../data/servicesStore';
import type { TeamMember } from '../../data/equipeFuncionamento';
import { returnPlainText } from '../../data/followUpModels';

type Props = {
  services: ServiceItem[];
  categories: Category[];
  members: TeamMember[];
  /** `tab`: aba que abre primeiro (W2, A3-07: "Completar" abre em "O que a assistente explica"). */
  onOpen: (s: ServiceItem, tab?: string) => void;
  /** Botão à direita da barra da lista ("+ Novo serviço"). */
  action?: React.ReactNode;
};

const ALL = 'todas';

function Pros({ ids, members }: {ids: string[];members: TeamMember[];}) {
  // G4 (F-057): profissional arquivado continua ligado ao serviço (histórico), mas aparece marcado e não conta como quem faz.
  const people = (ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as TeamMember[]).sort((a, b) => Number(a.active === false) - Number(b.active === false));
  if (!people.some((p) => p.active !== false)) return <span className="text-sm text-text-muted">Ninguém ativo{people.length ? ` (${people.length} arquivado${people.length === 1 ? '' : 's'})` : ''}</span>;
  return (
    <span className="flex flex-col gap-1">
      {people.map((p) =>
      p.active === false ?
      <span key={p.id} className="text-xs text-text-secondary">
            {p.name} (arquivado)
          </span> :

      <ProfessionalTag key={p.id} name={p.name} color={p.color} size="sm" />

      )}
    </span>);

}

/**
 * W2 (A3-07, A3-08): o selo diz o que falta ("Falta a descrição") e, ao lado, "Completar" abre o serviço direto na aba
 * "O que a assistente explica". Mesmo padrão do "Ver" da Equipe (abre o perfil na aba Serviços) e do "Alterar" de
 * Funcionamento › Intervalos (abre na aba Intervalo).
 */
function AssistantBadge({ s, onComplete }: {s: ServiceItem;onComplete?: () => void;}) {
  const st = knowledgeStatus(s);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status={st.complete ? 'success' : 'warning'} label={knowledgeBadgeLabel(st)} minWidth="md" />
      {!st.complete && onComplete &&
      <Button
        size="sm"
        variant="neutral"
        aria-label={`Completar a descrição de ${s.name}`}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}>
        
          Completar
        </Button>
      }
    </span>);

}

/** Texto da dica dentro do cabeçalho da tabela: sem herdar as maiúsculas do cabeçalho (A3-08). */
const tipText = (t: string) => <span className="normal-case tracking-normal">{t}</span>;

/**
 * Serviços: tabela agrupada por categoria, linha inteira abre o serviço (19/10/2026). Lote B: a coluna Retorno mostra o modelo do serviço. Ajustes do Lote B (21/10/2026): texto simples ("Volta a cada 30 dias") e coluna logo depois do nome.
 * Rodada de 11/11/2026 (pedido do Christian): "+ Novo serviço" fica à direita da barra da lista, no lugar de "Gerenciar
 * categorias". "Gerenciar categorias" saiu da tela e fica só dentro da janela do serviço (abaixo do campo Categoria).
 */
export function ServicosTab({ services, categories, members, onOpen, action }: Props) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(ALL);
  const [show, setShow] = useState<'ativos' | 'arquivados'>('ativos');

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
    services.filter(
      (s) =>
      (show === 'ativos' ? s.active : !s.active) && (
      cat === ALL || s.categoryId === cat) && (
      !q || s.name.toLowerCase().includes(q) || s.knowledge.synonyms.some((x) => x.toLowerCase().includes(q)))
    ),
    [services, show, cat, q]
  );
  const groups = categories.map((c) => ({ ...c, items: filtered.filter((s) => s.categoryId === c.id) })).filter((g) => g.items.length > 0);
  const orphans = filtered.filter((s) => !categories.some((c) => c.id === s.categoryId));
  if (orphans.length) groups.push({ id: 'sem-categoria', name: 'Sem categoria', items: orphans });
  const archivedCount = services.filter((s) => !s.active).length;
  const incomplete = services.filter((s) => s.active && !knowledgeStatus(s).complete).length;

  const rowKey = (s: ServiceItem) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(s);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${toolbarClass} justify-between`}>
        <div className={toolbarClass}>
          <Input aria-label="Buscar serviço" placeholder="Buscar serviço" value={query} onChange={(e) => setQuery(e.target.value)} prefix={<SearchIcon className="h-4 w-4 text-text-muted" />} containerClassName="w-full sm:w-64" />
          <Select ariaLabel="Categoria" className="w-full sm:w-52" options={[{ value: ALL, label: 'Todas as categorias' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} value={cat} onChange={setCat} />
          <PillGroup
            size="sm"
            options={[
            { value: 'ativos', label: 'Ativos' },
            { value: 'arquivados', label: archivedCount ? `Arquivados (${archivedCount})` : 'Arquivados' }]
            }
            value={show}
            onChange={(v) => (v === 'ativos' || v === 'arquivados') && setShow(v)} />
          
        </div>
        {action}
      </div>

      {incomplete > 0 && show === 'ativos' &&
      // L11 (meta 4): uma frase; o resto no "i".
      <p className="inline-flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
          {incomplete === 1 ? '1 serviço ainda não tem' : `${incomplete} serviços ainda não têm`} a descrição para o cliente.
          <InfoTip label="Descrição para o cliente" content="Enquanto falta, a assistente passa as dúvidas sobre o serviço para a equipe. Use “Completar” na linha do serviço." />
        </p>
      }

      {groups.length === 0 ?
      <EmptyState
        variant="dotted"
        title={show === 'arquivados' ? 'Nenhum serviço arquivado' : q || cat !== ALL ? 'Nenhum serviço encontrado' : 'Nenhum serviço cadastrado'}
        description={show === 'arquivados' ? 'Serviços arquivados saem das listas de agendamento e a assistente deixa de oferecer.' : 'Cadastre os serviços para a assistente saber o que oferecer, quanto custa e quanto tempo leva.'} /> :


      <>
          {/* Desktop / tablet */}
          <div className="hidden md:block">
            <Table containerClassName="bg-surface">
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Retorno
                      <InfoTip label="Retorno" side="bottom" content={tipText('De quanto em quanto tempo o cliente costuma voltar para este serviço. Serve para lembrar o cliente de voltar (veja em Automações). Para mudar, abra o serviço.')} />
                    </span>
                  </TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead align="right">Preço</TableHead>
                  <TableHead>Profissionais</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Assistente
                      <InfoTip label="Assistente" side="left" content={tipText('Se a assistente já tem a descrição do serviço para explicar ao cliente. Sem ela, a assistente passa a dúvida para a equipe. Complete na aba “O que a assistente explica”.')} />
                    </span>
                  </TableHead>
                  <TableHead align="right">
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) =>
              <React.Fragment key={g.id}>
                    <TableRow className="bg-background hover:bg-background">
                      <TableCell colSpan={7} className="py-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                        {g.name}
                      </TableCell>
                    </TableRow>
                    {g.items.map((s) =>
                <TableRow key={s.id} tabIndex={0} role="button" aria-label={`Abrir ${s.name}`} onClick={() => onOpen(s)} onKeyDown={rowKey(s)} className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                        <TableCell>
                          <p className="text-sm font-bold text-text-primary">{s.name}</p>
                          <p className="text-xs text-text-secondary">
                            {kindLabel(s.kind)} · {s.modality === 'online' ? 'Online' : 'Presencial'}
                            {/* CONTRATO NOVO (aulas em grupo, 23/11/2026): "Em grupo, 4 vagas" na mesma linha, sem coluna nem etiqueta nova. */}
                            {isGroupService(s) && ` · ${groupLabel(s)}`}
                          </p>
                        </TableCell>
                        <TableCell className={s.followUp.model === 'sem-retorno' ? 'text-text-muted' : 'font-semibold text-text-primary'}>{returnPlainText(s.followUp)}</TableCell>
                        <TableCell className="tabular-nums text-text-secondary">{s.durationMin} min</TableCell>
                        <TableCell numeric className="font-semibold text-text-primary">
                          {priceLabel(s)}
                        </TableCell>
                        <TableCell>
                          <Pros ids={s.professionalIds} members={members} />
                        </TableCell>
                        <TableCell>
                          <AssistantBadge s={s} onComplete={() => onOpen(s, 'assistente')} />
                        </TableCell>
                        <TableCell align="right">
                          <ChevronRightIcon className={clickableChevronClass} aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                )}
                  </React.Fragment>
              )}
              </TableBody>
            </Table>
          </div>

          {/* Celular */}
          <div className="flex flex-col gap-5 md:hidden">
            {groups.map((g) =>
          <section key={g.id} aria-label={g.name}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">{g.name}</h2>
                <ul className="flex flex-col gap-3">
                  {g.items.map((s) =>
              <li key={s.id}>
                      <button type="button" onClick={() => onOpen(s)} className={`${clickableCardClass} flex-col items-stretch`} aria-label={`Abrir ${s.name}`}>
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-text-primary">{s.name}</span>
                            <span className="block text-xs text-text-secondary">
                              {kindLabel(s.kind)} · {s.durationMin} min · {priceLabel(s)}
                              {isGroupService(s) && ` · ${groupLabel(s)}`}
                            </span>
                            <span className="mt-1 block text-sm text-text-primary">
                              <span className="text-text-secondary">Retorno: </span>
                              <span className="font-semibold">{returnPlainText(s.followUp)}</span>
                            </span>
                          </span>
                          <ChevronRightIcon className={`${clickableChevronClass} mt-0.5`} aria-hidden="true" />
                        </span>
                        <span className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                          <Pros ids={s.professionalIds} members={members} />
                          <AssistantBadge s={s} />
                        </span>
                      </button>
                    </li>
              )}
                </ul>
              </section>
          )}
          </div>
        </>
      }
    </div>);

}