import { wordsNow } from '../../data/segment';
import React, { useEffect, useState } from 'react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Input } from '../Input';
import { Select } from '../Select';
import { Textarea } from '../Textarea';
import { TagPicker } from '../client/TagPicker';
import { useNavigate } from 'react-router-dom';
import { NoticeInline } from '../ui/Notice';
import { clientWithPhone, createClient, isValidEmail, originCatalog, resolvePendingTags } from '../../data/api/clientes';
import { maskPhoneBR } from '../../utils/masks';

// Catálogo de origens da clínica (GET /api/clients/origins). As tags vêm do catálogo vivo (TagPicker).
const clientOrigins = originCatalog.map((o) => ({ value: o.id, label: o.name }));

export type NovoClienteData = {
  name: string;
  phone: string;
  email: string;
  origin: string;
  tags: string[];
  note: string;
};

type NovoClienteModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (data: NovoClienteData) => void;
  /** L24c: o nome já digitado no campo de cliente ("Cadastrar cliente") abre preenchido. */
  initialName?: string;
};

/* L22: a máscara do WhatsApp é a única do Painel (`utils/masks.ts`); o campo continua guardando o texto formatado. */

const empty: NovoClienteData = { name: '', phone: '', email: '', origin: '', tags: [], note: '' };

export function NovoClienteModal({ open, onClose, onSaved, initialName }: NovoClienteModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<NovoClienteData>(empty);
  const [submitted, setSubmitted] = useState(false);
  /** W5 (G13): o aviso de WhatsApp repetido aparece ao sair do campo (e ao cadastrar). */
  const [phoneTouched, setPhoneTouched] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setForm({ ...empty, name: (initialName ?? '').trim() });
      setSubmitted(false);
      setPhoneTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const phoneDigits = form.phone.replace(/\D/g, '').length;
  // W5 (G13, 11/11/2026): o WhatsApp identifica a conversa; o mesmo número não entra em dois cadastros.
  const owner = phoneDigits >= 10 ? clientWithPhone(form.phone) : null;
  const errors = {
    name: !form.name.trim() ? 'Informe o nome.' : undefined,
    phone: phoneDigits < 10 ? 'Informe um telefone com DDD.' : owner ? 'WhatsApp já cadastrado.' : undefined,
    email: form.email && !isValidEmail(form.email) ? 'Informe um e-mail válido.' : undefined
  };

  const save = () => {
    setSubmitted(true);
    setPhoneTouched(true);
    if (errors.name || errors.phone || errors.email) return;
    // POST /api/clients — cadastro manual (consent_source "manual", como no formulário real)
    createClient({
      name: form.name.trim(),
      phone: form.phone,
      email: form.email || null,
      notes: form.note || null,
      origin_id: form.origin || null,
      tag_ids: resolvePendingTags(form.tags)
    });
    onSaved?.({ ...form, name: form.name.trim() });
    toast({ title: 'Cliente cadastrado', description: `${form.name.trim()} já aparece na sua lista de clientes.` });
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Novo cliente"
      footer={
      <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Cadastrar</Button>
        </>
      }>
      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label="Nome" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={submitted ? errors.name : undefined} />
        </div>
        <Input
          label="WhatsApp"
          required
          inputMode="tel"
          placeholder="Ex.: (19) 99999-9999"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: maskPhoneBR(e.target.value) }))}
          onBlur={() => setPhoneTouched(true)}
          error={submitted || phoneTouched && owner ? errors.phone : undefined} />
        
        <Input label="E-mail (opcional)" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={submitted ? errors.email : undefined} />
        {owner && (phoneTouched || submitted) &&
        <div className="sm:col-span-2">
            <NoticeInline tone="warning" role="alert" title={`Este WhatsApp já é de ${owner.name}`}>
              <p>
                Cada WhatsApp fica num cadastro só, porque é ele que liga a conversa ao cliente.{owner.archived ? ` ${owner.name} está arquivado.` : ''} Se a pessoa agenda para outra (por exemplo, a mãe para a filha), use a ficha existente e marque
                “Atendimento para terceiro” no agendamento.
              </p>
              <Button
              size="md"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                const to = `/clientes/${encodeURIComponent(owner.id)}`;
                onClose();
                // A janela tinha alterações: a guarda (data/dirtyGuard.ts) tira a entrada extra do histórico com
                // history.back() logo depois de fechar. Navegar antes disso faz o back desfazer a ida para a ficha.
                window.setTimeout(() => navigate(to), 450);
              }}>
              
                Abrir ficha de {owner.name}
              </Button>
            </NoticeInline>
          </div>
        }
        <div className="sm:col-span-2">
          <Select label={`Como conheceu ${wordsNow().the}`} placeholder="Escolha a origem" options={clientOrigins} value={form.origin || undefined} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} />
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-text-primary">Tags</p>
          <TagPicker value={form.tags} onChange={(ids) => setForm((f) => ({ ...f, tags: ids }))} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Observação (opcional)" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </div>
    </AppModal>);

}