import React, { useEffect, useMemo, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { ModalActions } from '../ui/ModalActions';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { DateField } from '../ui/DateField';
import { SegmentedControl } from '../Card';
import { ClientSelect } from '../client/ClientSelect';
import { NovoClienteModal } from '../modals/NovoClienteModal';
import { createPackage } from '../../data/api/pacotes';
import type { PackagePaymentPlan } from '../../data/api/pacotes';
import { allClientsForSelect, clientIdOfRecordedName } from '../../data/api/clientes';
import { catalogServices, serviceOptions } from '../../data/catalogo';
import { isActiveMember, useTeam } from '../../data/availability';
import { TODAY_ISO } from '../../data/agendaStore';
import {
  CONDICOES_PAGAMENTO,
  EXPLICACAO_CONDICAO,
  FORMAS,
  TEXTO_PREFERENCIA_NAO_E_EXECUTOR,
  dataBR,
  formatarValor,
  gerarParcelas,
  rotuloCondicao } from
'../../data/pacotesLib';

const toCents = (v: string) => Math.round(Number(v.replace(/\./g, '').replace(',', '.') || '0') * 100);
const toReais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const h3 = 'text-xs font-bold uppercase tracking-wide text-text-muted';

/**
 * VENDER UM PACOTE — the contract (sessions, validity) and the money of the sale in one step.
 * Same fields, rules and messages as the real `VendaDePacoteModal` (POST /api/packages).
 * L24c (19/11/2026, pedido 3a): o campo Cliente é o `ClientSelect` (DS 6.2 `Select searchable`): filtra enquanto digita e
 * tem "Cadastrar cliente" no topo, que abre o Novo cliente com o nome digitado; o cliente cadastrado volta escolhido (pelo id).
 */
export function VendaDePacoteModal({
  open,
  onClose,
  onSalvo,
  clientePreSelecionadoId,
  servicoPreSelecionadoId








}: {open: boolean;onClose: () => void;onSalvo?: () => void; /** Opens with this client already chosen (from the client record) */clientePreSelecionadoId?: string; /** CONTRATO NOVO (aulas em grupo, 23/11/2026): abre com este serviço já escolhido (janela da turma › "Vender pacote agora"). */servicoPreSelecionadoId?: string;}) {
  const toast = useToast();
  const [clienteId, setClienteId] = useState('');
  const [servicoId, setServicoId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [sessoes, setSessoes] = useState(10);
  const [valorTexto, setValorTexto] = useState('0,00');
  const [valorManual, setValorManual] = useState(false);
  const [vendidoEm, setVendidoEm] = useState(TODAY_ISO);
  const [validade, setValidade] = useState('');
  const [condicao, setCondicao] = useState<PackagePaymentPlan>('cash');
  const [forma, setForma] = useState('pix');
  const [vezes, setVezes] = useState(2);
  const [qtdParcelas, setQtdParcelas] = useState(3);
  const [primeiroVenc, setPrimeiroVenc] = useState(TODAY_ISO);
  const [parcelas, setParcelas] = useState<{due_date: string;amount_cents: number;}[]>([]);
  const [tocou, setTocou] = useState(false);
  /** L24c: janela Novo cliente aberta a partir de "Cadastrar cliente", com o nome digitado. */
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');

  useEffect(() => {
    if (!open) return;
    setClienteId(clientePreSelecionadoId ?? '');
    setServicoId(servicoPreSelecionadoId ?? '');
    setProfissionalId('');
    setSessoes(10);
    setValorTexto('0,00');
    setValorManual(false);
    setVendidoEm(TODAY_ISO);
    setValidade('');
    setCondicao('cash');
    setForma('pix');
    setVezes(2);
    setQtdParcelas(3);
    setPrimeiroVenc(TODAY_ISO);
    setTocou(false);
    setNewClientOpen(false);
    setNewClientName('');
  }, [open, clientePreSelecionadoId, servicoPreSelecionadoId]);

  // G3: só serviços ATIVOS podem ser vendidos (arquivado sai da escolha; contratos e históricos já existentes não mudam).
  const activeServiceIds = new Set(serviceOptions.map((o) => o.value));
  const servico = catalogServices.find((s) => s.value === servicoId);
  const precoPorSessao = servico ? servico.price * 100 : null;
  const recomendado = precoPorSessao != null && sessoes > 0 ? precoPorSessao * sessoes : null;
  const valorCents = toCents(valorTexto);
  const cortesia = valorCents === 0;
  const comAClinica = condicao === 'clinic_installments';

  useEffect(() => {
    if (!valorManual && recomendado != null) setValorTexto(toReais(recomendado));
  }, [valorManual, recomendado]);
  useEffect(() => setProfissionalId(''), [servicoId]);
  useEffect(() => {
    if (cortesia) setCondicao('cash');
  }, [cortesia]);
  useEffect(() => {
    if (comAClinica && !cortesia && !tocou) setParcelas(gerarParcelas(valorCents, qtdParcelas, primeiroVenc || vendidoEm));
  }, [comAClinica, cortesia, tocou, valorCents, qtdParcelas, primeiroVenc, vendidoEm]);

  // G1 (F-003): equipe viva (só ativos podem ser preferidos num pacote novo).
  const { members } = useTeam();
  const profissionais = useMemo(() => servico ? members.filter((m) => isActiveMember(m) && m.services.includes(servico.label)) : [], [servico, members]);
  const clientes = allClientsForSelect();
  const soma = parcelas.reduce((t, p) => t + p.amount_cents, 0);

  const pendencia = !clienteId ?
  'Escolha o cliente.' :
  !servicoId ?
  'Escolha o serviço do pacote.' :
  sessoes < 1 ?
  'Um pacote precisa de pelo menos uma sessão.' :
  validade && validade < vendidoEm ?
  'A validade não pode ser anterior à data da venda.' :
  !cortesia && condicao === 'cash' && !forma ?
  'Escolha a forma de pagamento.' :
  !cortesia && condicao === 'card_installments' && vezes < 2 ?
  'Parcelamento no cartão começa em 2×.' :
  !cortesia && comAClinica && soma !== valorCents ?
  `As parcelas somam ${formatarValor(soma)} e o pacote vale ${formatarValor(valorCents)}. A soma precisa ser exata.` :
  null;

  const salvar = () => {
    if (pendencia) return;
    createPackage({
      client_id: clienteId,
      client_name: clientes.find((c) => c.id === clienteId)?.name ?? '',
      service_id: servicoId,
      total_sessions: sessoes,
      total_amount_cents: valorCents,
      sold_at: vendidoEm,
      expires_at: validade || null,
      payment_plan: cortesia ? 'cash' : condicao,
      payment_method: cortesia ? null : condicao === 'card_installments' ? 'credit' : comAClinica ? null : forma,
      card_installments: !cortesia && condicao === 'card_installments' ? vezes : null,
      installments: !cortesia && comAClinica ? parcelas : undefined,
      preferred_professional_id: profissionalId || null
    });
    toast({ title: 'Pacote vendido. O saldo já está disponível para o cliente.' });
    onSalvo?.();
    onClose();
  };

  return (
    <>
    <AppModal
        open={open && !newClientOpen}
        onClose={onClose}
        size="lg"
        title="Vender pacote"
        description="O contrato (sessões e validade) e o dinheiro da venda, no mesmo gesto."
        footer={
        <ModalActions
          start={
          <p className={`text-sm ${pendencia ? 'text-warning' : 'text-text-secondary'}`}>
              {pendencia ?? `${formatarValor(valorCents)} · ${cortesia ? 'Cortesia' : rotuloCondicao(condicao)}`}
            </p>
          }>
          
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!!pendencia} onClick={salvar}>
            Vender pacote
          </Button>
        </ModalActions>
        }>
        
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4" aria-label="Contrato">
          <div>
            <h3 className={h3}>Contrato</h3>
            <p className="mt-1 text-sm text-text-secondary">Defina o serviço, a quantidade de sessões e a validade.</p>
          </div>
          <ClientSelect
              options={clientes.map((c) => ({ value: c.id, label: c.name }))}
              value={clienteId}
              onChange={setClienteId}
              onCreate={(typed) => {
                setNewClientName(typed);
                setNewClientOpen(true);
              }} />
            
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
                label="Serviço"
                placeholder="Selecione"
                options={catalogServices.filter((s) => activeServiceIds.has(s.value) || s.value === servicoId).map((s) => ({ value: s.value, label: s.label, description: `${formatarValor(s.price * 100)} por sessão` }))}
                value={servicoId || undefined}
                onChange={setServicoId}
                helperText="O pacote cobre este serviço. A sessão só é baixada quando ele é realizado." />
              
            <Select
                label="Profissional preferido (opcional)"
                placeholder="Sem preferência"
                options={[{ value: '', label: 'Sem preferência' }, ...profissionais.map((m) => ({ value: m.id, label: m.name, color: m.color }))]}
                value={profissionalId}
                onChange={setProfissionalId}
                disabled={!servicoId}
                helperText={servicoId ? TEXTO_PREFERENCIA_NAO_E_EXECUTOR : 'Escolha o serviço primeiro — a lista mostra quem atende esse serviço.'} />
              
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[7rem_1fr_1fr]">
            <Input label="Sessões" type="number" min={1} max={200} value={String(sessoes)} onChange={(e) => setSessoes(Math.max(1, Number(e.target.value) || 1))} />
            <DateField label="Data da venda" value={vendidoEm} onChange={setVendidoEm} clearable={false} />
            <DateField label="Validade (opcional)" value={validade} onChange={setValidade} />
          </div>
          <p className="text-xs text-text-muted">Sem validade, o pacote não vence. Após vencer, o saldo permanece, mas novas baixas ficam bloqueadas até a validade ser estendida.</p>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5" aria-label="Pagamento">
          <h3 className={h3}>Pagamento</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
                label="Valor total do pacote"
                prefix="R$"
                inputMode="decimal"
                value={valorTexto}
                onChange={(e) => {
                  setValorManual(true);
                  setValorTexto(e.target.value);
                }}
                helperText={cortesia ? 'Valor zero é cortesia: não gera lançamento financeiro.' : undefined} />
              
            {recomendado != null &&
              <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm">
                <p className="font-semibold text-text-primary">Valor recomendado: {formatarValor(recomendado)}</p>
                <p className="text-xs text-text-secondary">
                  {sessoes} sessões × {formatarValor(precoPorSessao!)} por sessão
                </p>
                {valorManual && valorCents !== recomendado &&
                <p className="mt-1 text-xs text-text-secondary">
                    {valorCents < recomendado ? `Desconto: ${formatarValor(recomendado - valorCents)} · ` : ''}
                    <Button size="sm" variant="neutral" className="ml-1" onClick={() => setValorManual(false)}>
                      Usar o recomendado
                    </Button>
                  </p>
                }
              </div>
              }
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-text-primary">Condição de pagamento</legend>
            {/* G5 P8: SegmentedControl wrap do DS v3.18 (escolha única; quebra linha no celular em vez de transbordar). */}
            <SegmentedControl
                wrap
                label="Condição de pagamento"
                value={condicao}
                onChange={(v) => setCondicao(v as PackagePaymentPlan)}
                options={(Object.keys(CONDICOES_PAGAMENTO) as PackagePaymentPlan[]).map((c) => ({ value: c, label: CONDICOES_PAGAMENTO[c], disabled: cortesia && c !== 'cash' }))} />
              
            <p className="mt-1.5 text-xs text-text-muted">{cortesia ? 'Cortesia é sempre à vista. Para parcelar, informe um valor maior que zero.' : EXPLICACAO_CONDICAO[condicao]}</p>
          </fieldset>

          {cortesia ?
            <Input label="Forma de pagamento" value="Não se aplica — cortesia" disabled readOnly /> :
            condicao === 'cash' ?
            <Select label="Forma de pagamento" options={Object.entries(FORMAS).map(([value, label]) => ({ value, label }))} value={forma} onChange={setForma} helperText={`Entra como um recebimento de ${formatarValor(valorCents)}, na data da venda.`} /> :
            condicao === 'card_installments' ?
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Forma de pagamento" value="Cartão de crédito" disabled readOnly />
              <Input label="Vezes no cartão" type="number" min={2} max={24} value={String(vezes)} onChange={(e) => setVezes(Number(e.target.value) || 0)} helperText={`Entra como um recebimento de ${formatarValor(valorCents)}, já quitado.`} />
            </div> :

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Número de parcelas" type="number" min={1} max={24} value={String(qtdParcelas)} onChange={(e) => {setTocou(false);setQtdParcelas(Math.max(1, Number(e.target.value) || 1));}} />
                <DateField label="Primeiro vencimento" value={primeiroVenc} onChange={(v) => {setTocou(false);setPrimeiroVenc(v);}} clearable={false} />
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {parcelas.map((p, i) =>
                <li key={i} className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-3 px-3 py-2">
                    <span className="text-xs font-semibold text-text-muted">Parcela {i + 1}</span>
                    <span className="text-sm tabular-nums text-text-primary">vence em {dataBR(p.due_date)}</span>
                    <Input
                    aria-label={`Valor da parcela ${i + 1}`}
                    prefix="R$"
                    inputMode="decimal"
                    value={toReais(p.amount_cents)}
                    onChange={(e) => {
                      setTocou(true);
                      const cents = toCents(e.target.value);
                      setParcelas((list) => list.map((x, j) => j === i ? { ...x, amount_cents: cents } : x));
                    }} />
                  
                  </li>
                )}
              </ul>
              <p className={`text-sm tabular-nums ${soma === valorCents ? 'text-text-secondary' : 'font-semibold text-warning'}`}>
                Soma das parcelas: {formatarValor(soma)} de {formatarValor(valorCents)}
              </p>
            </div>
            }
        </section>
      </div>
    </AppModal>
    {/* L24c: Novo cliente aberto por "Cadastrar cliente", com o nome digitado; o cliente cadastrado volta escolhido. */}
    <NovoClienteModal
        open={open && newClientOpen}
        onClose={() => setNewClientOpen(false)}
        initialName={newClientName}
        onSaved={(c) => {
          const id = clientIdOfRecordedName(c.name);
          if (id) setClienteId(id);
        }} />
      
    </>);

}