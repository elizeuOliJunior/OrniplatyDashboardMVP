import React, { useEffect, useRef, useState } from 'react';
import { HeartPulseIcon, IdCardIcon, MapPinIcon, StickyNoteIcon, TagIcon } from 'lucide-react';
import { Card } from '../Card';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { DateField } from '../ui/DateField';
import { useToast } from '../ui/Toast';
import { requestLeave, useDirtyForm } from '../ui/UnsavedChanges';
import { TagPicker } from './TagPicker';
import { isValidEmail, originCatalog, resolvePendingTags, updateClient } from '../../data/api/clientes';
import type { ClientResponse } from '../../data/api/clientes';
import { GENEROS, UFS } from '../../data/fichaLib';
import { logChange } from '../../data/legado';
import { maskCPF, maskPhoneBR } from '../../utils/masks';

const icon = 'h-4 w-4 text-primary';

function Secao({ titulo, icone, children }: {titulo: string;icone: React.ReactNode;children: React.ReactNode;}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex min-h-8 items-center gap-2 text-sm font-bold text-text-primary">
        {icone}
        {titulo}
      </h3>
      {children}
    </section>);

}

const snapshot = (r: ClientResponse, tagIds: string[]) => JSON.stringify({ ...r, tagIds: [...tagIds].sort() });

/** Campos acompanhados na trilha de alterações. `masked` não grava o valor (só que mudou). */
const TRACKED: {keys: (keyof ClientResponse)[];label: string;masked?: boolean;}[] = [
{ keys: ['name'], label: 'Nome' },
{ keys: ['landline_phone'], label: 'Telefone' },
{ keys: ['email'], label: 'E-mail' },
{ keys: ['cpf'], label: 'CPF', masked: true },
{ keys: ['birth_date'], label: 'Data de nascimento' },
{ keys: ['gender'], label: 'Sexo/gênero' },
{ keys: ['occupation'], label: 'Profissão' },
{ keys: ['zip_code', 'street', 'address_number', 'complement', 'district', 'city', 'state'], label: 'Endereço' },
{ keys: ['emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation'], label: 'Contato de emergência' },
{ keys: ['notes'], label: 'Observações' }];

const joined = (c: ClientResponse, keys: (keyof ClientResponse)[]) => keys.map((k) => c[k] as string | null ?? '').filter(Boolean).join(' · ');

/**
 * Cadastro inteiro do cliente, em edição (PUT /api/clients/{id}). Protegido contra saída com alterações não salvas.
 * Cada campo alterado entra na trilha de alterações da Ficha (simulação; no produto vem do servidor).
 * Rodada 3 da ficha (11/11/2026, Christian): o cartão Cadastro saiu. As informações principais ficam à vista no cartão do
 * cliente e o "Editar" ao lado do nome abre ESTE formulário no lugar do cartão (`onClose` volta ao cartão).
 * W5 (G11, 11/11/2026): o bloco antigo "Consentimento" saiu daqui. A informação era o canal do primeiro contato e passou
 * para o cartão do cliente, só leitura: "Primeiro contato por: WhatsApp" (ClientProfile).
 * Fica na coluna estreita da ficha a partir de 1280 px: ali os campos usam uma coluna só.
 * L22 (17/11/2026): Telefone, CPF e telefone de emergência com máscara ao digitar (`utils/masks.ts`). Guardam o texto
 * formatado, como os dados de exemplo já guardam.
 */
export function ClientRegistrationForm({ client, onManageTags, onClose }: {client: ClientResponse;onManageTags: () => void;onClose: () => void;}) {
  const toast = useToast();
  const [r, setR] = useState(client);
  const [tagIds, setTagIds] = useState<string[]>(() => client.tag_items.map((t) => t.id));
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const initial = useRef(snapshot(client, client.tag_items.map((t) => t.id)));
  const set = <K extends keyof ClientResponse,>(k: K, v: ClientResponse[K]) => setR((x) => ({ ...x, [k]: v }));
  const cardId = `cadastro-${client.id}`;

  useEffect(() => {
    requestAnimationFrame(() => document.getElementById(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = snapshot(r, tagIds) !== initial.current;

  /** Devolve false quando a validação barra o salvamento (a guarda usa isso e mantém o rascunho). */
  const salvar = (): boolean => {
    let ok = true;
    if (!r.name.trim()) {
      setNameError('Informe o nome do cliente.');
      ok = false;
    }
    if (r.email && !isValidEmail(r.email)) {
      setEmailError('Informe um e-mail válido.');
      ok = false;
    }
    if (!ok) {
      toast({ title: 'Revise os campos destacados', tone: 'warning' });
      return false;
    }
    const next = { ...r, name: r.name.trim() };
    TRACKED.forEach((t) => {
      const before = joined(client, t.keys);
      const after = joined(next, t.keys);
      if (before !== after) logChange(client.id, t.label, t.masked ? 'alterado' : before, t.masked ? 'novo valor registrado' : after);
    });
    if (JSON.stringify([...client.tag_items.map((x) => x.id)].sort()) !== JSON.stringify([...tagIds].sort())) logChange(client.id, 'Tags', `${client.tag_items.length} tag(s)`, `${tagIds.length} tag(s)`);
    if ((client.origin?.id ?? null) !== (r.origin?.id ?? null)) logChange(client.id, 'Origem', client.origin?.name ?? 'vazio', r.origin?.name ?? 'vazio');
    const { id: _id, tag_items: _t, origin, completed_appointments: _a, last_completed_at: _b, last_contact_at: _c, created_at: _d, ...fields } = r;
    updateClient(client.id, { ...fields, name: r.name.trim(), origin_id: origin?.id ?? null, tag_ids: resolvePendingTags(tagIds) });
    toast({ title: 'Ficha atualizada' });
    onClose();
    return true;
  };

  useDirtyForm(`ficha-${client.id}`, dirty, { save: salvar, discard: onClose });

  const txt = (k: keyof ClientResponse) => ({
    value: r[k] as string | null ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value || null) as never)
  });
  /** L22: campo com máscara (telefone ou CPF). Vazio continua `null`. */
  const masked = (k: keyof ClientResponse, mask: (v: string) => string) => ({
    value: r[k] as string | null ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (mask(e.target.value) || null) as never)
  });

  return (
    <Card as="section" padding="lg" aria-label="Editar cadastro" id={cardId} className="scroll-mt-6">
      <h2 className="text-base font-bold text-text-primary">Editar cadastro de {client.name}</h2>
      <p className="mb-4 text-sm text-text-secondary">Todos os campos são opcionais, menos nome e WhatsApp.{dirty ? ' Há alterações não salvas.' : ''}</p>
      <div className="flex flex-col gap-5">
        <Secao titulo="Identificação e contato" icone={<IdCardIcon className={icon} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Input label="Nome" value={r.name} error={nameError ?? undefined} onChange={(e) => {set('name', e.target.value);setNameError(null);}} />
            <Input label="WhatsApp" value={r.phone} disabled helperText="O número do WhatsApp identifica a conversa." />
            <Input label="Telefone" inputMode="tel" placeholder="Ex.: (19) 3215-4400" {...masked('landline_phone', maskPhoneBR)} helperText="Telefone alternativo. Não é o WhatsApp." />
            <Input label="E-mail" type="email" value={r.email ?? ''} error={emailError ?? undefined} onChange={(e) => {set('email', e.target.value || null);setEmailError(null);}} />
            <Input label="CPF" inputMode="numeric" placeholder="000.000.000-00" {...masked('cpf', maskCPF)} />
            <DateField label="Data de nascimento" value={r.birth_date ?? ''} onChange={(v) => set('birth_date', v || null)} placeholder="Selecione a data" />
            <Select label="Sexo/gênero" placeholder="Não informado" options={GENEROS.map((g) => ({ value: g.value, label: g.label }))} value={r.gender ?? undefined} onChange={(v) => set('gender', v as ClientResponse['gender'])} />
            <Input label="Profissão" {...txt('occupation')} />
            <Select
              label="Origem"
              placeholder="Não informada"
              options={originCatalog.map((o) => ({ value: o.id, label: o.name }))}
              value={r.origin?.id}
              onChange={(v) => set('origin', originCatalog.find((o) => o.id === v) ?? null)}
              className="sm:col-span-2 xl:col-span-1" />
            
          </div>
        </Secao>
        <Secao titulo="Tags" icone={<TagIcon className={icon} />}>
          <TagPicker value={tagIds} onChange={setTagIds} onManage={onManageTags} />
        </Secao>
        <Secao titulo="Endereço" icone={<MapPinIcon className={icon} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6 xl:grid-cols-1">
            <Input label="CEP" {...txt('zip_code')} containerClassName="sm:col-span-2 xl:col-span-1" />
            <Input label="Logradouro" {...txt('street')} containerClassName="sm:col-span-4 xl:col-span-1" />
            <Input label="Número" {...txt('address_number')} containerClassName="sm:col-span-2 xl:col-span-1" />
            <Input label="Complemento" {...txt('complement')} containerClassName="sm:col-span-4 xl:col-span-1" />
            <Input label="Bairro" {...txt('district')} containerClassName="sm:col-span-2 xl:col-span-1" />
            <Input label="Cidade" {...txt('city')} containerClassName="sm:col-span-2 xl:col-span-1" />
            <Select label="UF" placeholder="Não informado" options={UFS.map((u) => ({ value: u, label: u }))} value={r.state ?? undefined} onChange={(v) => set('state', v)} className="sm:col-span-2 xl:col-span-1" />
          </div>
        </Secao>
        <Secao titulo="Contato de emergência" icone={<HeartPulseIcon className={icon} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <Input label="Nome" {...txt('emergency_contact_name')} />
            <Input label="Telefone" inputMode="tel" {...masked('emergency_contact_phone', maskPhoneBR)} />
            <Input label="Relação" placeholder="Mãe, cônjuge…" {...txt('emergency_contact_relation')} />
          </div>
        </Secao>
        <Secao titulo="Observações" icone={<StickyNoteIcon className={icon} />}>
          <Textarea aria-label="Observações" placeholder="Ex.: prefere horários pela manhã." value={r.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} size="sm" />
        </Secao>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => requestLeave(onClose)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()}>Salvar</Button>
        </div>
      </div>
    </Card>);

}