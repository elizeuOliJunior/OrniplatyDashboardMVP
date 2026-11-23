import React, { useMemo, useState } from 'react';
import { DownloadIcon, HistoryIcon, ShieldCheckIcon } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { ModalActions } from '../ui/ModalActions';
import { ListPagination, usePaged } from '../ui/ListMore';
import type { ClientProfileResponse } from '../../data/api/clientes';
import { changesOf, useLegado } from '../../data/legado';
import { KIND_ORDER, KIND_TEXT, STATUS_TEXT, kindOf, kindReason } from '../../data/contactPreferences';
import { getFinanceEntries } from '../../data/convenios';
import { downloadFile, fileSlug } from '../../utils/download';
import { TODAY_ISO } from '../../data/agendaStore';
import { wordsNow } from '../../data/segment';

/**
 * Trilha de alterações do cadastro (espelha `/clients/{id}/changes`). Os exemplos vindos do protótipo são marcados.
 * Ficha reorganizada (11/11/2026): a lista mora na aba "Alterações" do Histórico (`TrilhaLista`); `TrilhaCard` continua
 * existindo com o mesmo conteúdo num cartão próprio.
 */
export function TrilhaLista({ clientId }: {clientId: string;}) {
  useLegado();
  const items = changesOf(clientId);
  const paged = usePaged(items, 5);
  return (
    <>
      {items.length === 0 ?
      <p className="text-sm text-text-muted">Nenhuma alteração registrada. Edições na ficha aparecem aqui com data e autor.</p> :

      <>
          <ul className="divide-y divide-border">
            {paged.pageItems.map((c) =>
          <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-text-primary">
                  {c.field}: <span className="font-normal text-text-secondary">{c.from}</span> → {c.to}
                </p>
                <p className="text-xs text-text-muted">
                  {c.at} · {c.by}
                </p>
              </li>
          )}
          </ul>
          <ListPagination page={paged.page} totalPages={paged.totalPages} onPageChange={paged.setPage} totalItems={items.length} pageSize={5} itemLabel="alterações" />
        </>
      }
      <p className="mt-3 text-xs text-text-muted">Cada edição da ficha entra aqui com data e autor.</p>
    </>);

}

export function TrilhaCard({ clientId }: {clientId: string;}) {
  useLegado();
  const total = changesOf(clientId).length;
  return (
    <Card as="section" padding="lg" aria-label="Alterações do cadastro">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text-primary">
        <HistoryIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Alterações do cadastro
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">{total}</span>
      </h2>
      <TrilhaLista clientId={clientId} />
    </Card>);

}

/**
 * L24e (19/11/2026): preferência de contato exportada pelos quatro tipos do dicionário (data/contactPreferences.ts),
 * cada um com a situação ("Recebe" / "Não recebe" / "Ainda não perguntado") e o motivo, quando houver. Substitui
 * `restricao_de_contato` ("não recebe retornos e ofertas…"). Nenhuma regra mudou.
 */
const contactPreferenceExport = (clientId: string) =>
KIND_ORDER.map((k) => {
  const r = kindOf(clientId, k);
  return { tipo: KIND_TEXT[k].label, situacao: STATUS_TEXT[r.status].label, motivo: kindReason(k, r) };
});

/**
 * Exportação dos dados do cliente (LGPD). G4 (F-064): baixa de verdade um arquivo .json gerado no navegador com o que a tela tem.
 * Ficha reorganizada (11/11/2026, Christian): abre pelo menu "⋯" do topo da ficha (`ExportarDadosModal`).
 */
export function ExportarDadosModal({ ficha, open, onClose }: {ficha: ClientProfileResponse;open: boolean;onClose: () => void;}) {
  const toast = useToast();
  const [shown, setShown] = useState(false);
  const { client } = ficha;
  const preview = useMemo(() => {
    if (!open) return '';
    const fechamentos = getFinanceEntries().filter((e) => e.clientName === client.name);
    return JSON.stringify(
      {
        gerado_em: TODAY_ISO,
        cadastro: { id: client.id, nome: client.name, whatsapp: client.phone, email: client.email, origem: client.origin?.name ?? null, tags: client.tag_items.map((t) => t.name) },
        atendimentos: ficha.atendimentos_total,
        lancamentos_financeiros: ficha.financeiro.total + fechamentos.length,
        conversas: ficha.conversas.total,
        alteracoes_do_cadastro: changesOf(client.id).length,
        // L24e: os quatro tipos, com situação e motivo (antes: `restricao_de_contato`).
        preferencia_de_contato: contactPreferenceExport(client.id)
      },
      null,
      2
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = () => {
    setShown(false);
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={close}
      size="md"
      title="Exportar dados do cliente"
      description={`Gera um arquivo .json com o que ${wordsNow().the} guarda sobre ${client.name} (pedido do titular, LGPD) e baixa no seu computador.`}
      unsavedGuard={false}
      footer={
      <ModalActions equal={2}>
          <Button variant="secondary" onClick={close}>
            Fechar
          </Button>
          <Button
          leftIcon={<DownloadIcon className="h-4 w-4" />}
          onClick={() => {
            setShown(true);
            const name = `dados-${fileSlug(client.name)}-${TODAY_ISO}.json`;
            const ok = downloadFile(name, preview, 'application/json');
            toast(ok ? { title: 'Arquivo baixado', description: `${name} está na pasta de downloads do seu navegador.`, tone: 'success' } : { title: 'Não foi possível baixar', description: 'O navegador bloqueou o download. O conteúdo aparece abaixo para copiar.', tone: 'warning' });
          }}>
          
            Baixar arquivo
          </Button>
        </ModalActions>
      }>
      
      <p className="text-sm text-text-secondary">Entram: cadastro, atendimentos, financeiro, conversas, trilha de alterações e preferência de contato.</p>
      {shown && <pre className="mt-4 max-h-64 overflow-auto rounded-button bg-surface-muted p-3 text-xs text-text-primary">{preview}</pre>}
    </AppModal>);

}

export function ExportacaoCard({ ficha }: {ficha: ClientProfileResponse;}) {
  const [open, setOpen] = useState(false);
  return (
    <Card as="section" padding="lg" aria-label="Dados e privacidade">
      <h2 className="flex items-center gap-2 text-base font-bold text-text-primary">
        <ShieldCheckIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        Dados e privacidade
      </h2>
      <p className="mt-2 text-sm text-text-secondary">Exporta os dados que {wordsNow().the} guarda sobre {ficha.client.name} (pedido do titular, LGPD).</p>
      <div className="mt-3">
        <Button variant="secondary" size="sm" leftIcon={<DownloadIcon className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Exportar dados do cliente
        </Button>
      </div>
      <ExportarDadosModal ficha={ficha} open={open} onClose={() => setOpen(false)} />
    </Card>);

}