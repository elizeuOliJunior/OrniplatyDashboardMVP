import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { StatusBadge } from '../StatusBadge';
import { Card, CardTitle, ClientProcess, ScrollList } from '../Card';
import { MOTIVE_LABEL, OUTCOME_LABEL, closuresOf, outcomeLabelOf, processItems, shortDate, whoActs } from '../../data/followUp';
import type { FollowUpCase } from '../../data/followUp';
import type { AutomationMode } from '../../data/automacoes';

const ORDER = { precisa: 0, cuidando: 1, resolvidos: 2 } as const;

/**
 * Ficha › Acompanhamento (Lote C, 20/10/2026): o processo de cada serviço deste cliente (`ClientProcess`), na mesma
 * fonte de Oportunidades (`useFollowUp`), e os fechamentos em que o retorno ficou como "Não precisa".
 * Só consulta: a única ação é abrir o caso em Oportunidades.
 * Rodada 5 da Ficha (11/11/2026, Christian): com mais de 3 itens a lista rola por dentro do cartão (`ScrollList`;
 * 3 visíveis porque cada item é alto).
 * W9a (12/11/2026, conferência final, N-05; decisão G8): a etiqueta “A Orniplaty está cuidando” passa a “Programados”,
 * o mesmo nome da aba de Oportunidades, e o caso ganha a mesma linha “Quem envia / Quem age agora” do cartão de
 * “Programados” (`whoActs`, data/followUp.ts). Antes a etiqueta dizia que a Orniplaty agia e a linha de baixo, que era a equipe.
 */
export function AcompanhamentoCard({ clientId, cases, mode }: {clientId: string;cases: FollowUpCase[];mode: AutomationMode;}) {
  const navigate = useNavigate();
  const sorted = cases.slice().sort((a, b) => ORDER[a.situation] - ORDER[b.situation]);
  const notNeeded = closuresOf(clientId).filter((c) => c.choice === 'nao-precisa');

  return (
    <Card as="section" padding="lg" id="bloco-acompanhamento" aria-labelledby="acompanhamento-titulo" className="scroll-mt-6">
      <CardTitle as="h2" id="acompanhamento-titulo">
        Acompanhamento
      </CardTitle>
      <p className="mt-1 text-sm text-text-secondary">Como a Orniplaty acompanha este cliente em cada serviço. Para agir, abra em Oportunidades.</p>

      {sorted.length === 0 && notNeeded.length === 0 ?
      <p className="mt-4 text-sm text-text-secondary">Nenhum acompanhamento. Começa quando um atendimento com retorno é fechado sem horário marcado, ou quando o cliente falta, pede preço ou some.</p> :

      <div className="mt-4">
          <ScrollList ariaLabel="Acompanhamentos do cliente" visible={3} className="flex flex-col divide-y divide-border">
            {sorted.map((c) => {
            const o = c.outcome;
            return (
              <li key={c.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-text-primary">{c.service}</h3>
                      {c.motive && <StatusBadge status="neutral" label={MOTIVE_LABEL[c.motive]} />}
                      {c.situation === 'precisa' && <StatusBadge status="warning" label="Precisa de você" />}
                      {c.situation === 'cuidando' && <StatusBadge status="info" label="Programados" />}
                      {c.situation === 'resolvidos' && o && <StatusBadge status={OUTCOME_LABEL[o.kind].tone} label={outcomeLabelOf(c)} />}
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {c.model} · {c.deadline}
                    </p>
                    {c.situation === 'precisa' && c.need && <p className="mt-1 text-sm font-semibold text-text-primary">{c.need.title}</p>}
                    {c.situation === 'cuidando' && <p className="mt-1 text-sm text-text-secondary">{whoActs(c, mode)}</p>}
                    <div className="mt-2">
                      <ClientProcess items={processItems(c, mode)} />
                    </div>
                  </div>
                  {c.situation !== 'resolvidos' &&
                <div className="shrink-0">
                      <Button size="md" variant="secondary" onClick={() => navigate(`/oportunidades?caso=${encodeURIComponent(c.id)}&cliente=${encodeURIComponent(c.clientId)}`)}>
                        Abrir em Oportunidades
                      </Button>
                    </div>
                }
                </li>);

          })}
            {notNeeded.map((cl) =>
          <li key={cl.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-text-primary">{cl.service}</h3>
                  <StatusBadge status="neutral" label="Sem retorno" />
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">Atendimento de {shortDate(cl.iso)} fechado com o retorno como “Não precisa”. Nada é programado.</p>
              </li>
          )}
          </ScrollList>
        </div>
      }
    </Card>);

}