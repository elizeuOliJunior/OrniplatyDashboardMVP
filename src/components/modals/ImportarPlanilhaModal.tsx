import React, { useEffect, useRef, useState } from 'react';
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
import { AppModal } from '../ui/AppModal';
import { useToast } from '../ui/Toast';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { NoticeInline } from '../ui/Notice';
import { cardButton } from '../ui/styles';
import { importAccepted, readSpreadsheet, reviewRows, templateRows } from '../../data/importClientes';
import type { ImportReview } from '../../data/importClientes';
import { currentContent, currentWords } from '../../data/empresa';
import { downloadFile, toCsv } from '../../utils/download';

type ImportarPlanilhaModalProps = {
  open: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
};

type Step = 'arquivo' | 'revisao' | 'resumo';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Importar planilha de clientes (G4, F-065): lê de verdade (.csv/.xlsx até 5 MB), mostra as linhas aceitas e recusadas
 * com o motivo e grava só as aceitas no cadastro único. Os números vêm da conferência. Importar não registra consentimento
 * nem cria histórico de atendimento (ver data/importClientes.ts).
 */
export function ImportarPlanilhaModal({ open, onClose, onImported }: ImportarPlanilhaModalProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [responsible, setResponsible] = useState(false);
  const [step, setStep] = useState<Step>('arquivo');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<ImportReview | null>(null);
  const [created, setCreated] = useState(0);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResponsible(false);
      setStep('arquivo');
      setError('');
      setReview(null);
      setCreated(0);
    }
  }, [open]);

  const pick = async (f: File | null) => {
    setFile(f);
    setError('');
    setReview(null);
    if (!f) return;
    setReading(true);
    try {
      const rows = await readSpreadsheet(f);
      const r = reviewRows(f.name, rows);
      if ('error' in r) setError(r.error);else
      setReview(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler este arquivo. Confira se é uma planilha .csv ou .xlsx.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const ok = downloadFile('modelo-clientes-orniplaty.csv', toCsv(templateRows(currentContent().exampleService)), 'text/csv;charset=utf-8');
    toast(ok ? { title: 'Modelo baixado', description: 'modelo-clientes-orniplaty.csv está na pasta de downloads do seu navegador.', tone: 'success' } : { title: 'Não foi possível baixar', description: 'O navegador bloqueou o download.', tone: 'warning' });
  };

  const confirm = () => {
    if (!review) return;
    const ids = importAccepted(review.accepted);
    setCreated(ids.length);
    setStep('resumo');
    onImported?.(ids.length);
  };

  const accepted = review?.accepted.length ?? 0;
  const rejected = review?.rejected.length ?? 0;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size={step === 'revisao' ? 'lg' : 'md'}
      unsavedGuard={false}
      title={step === 'resumo' ? 'Importação concluída' : step === 'revisao' ? 'Confira antes de importar' : 'Importar planilha de clientes'}
      description={step === 'arquivo' ? 'Aceita .csv ou .xlsx de até 5 MB, com as colunas Nome e Telefone (WhatsApp). E-mail, Última visita e Serviço são opcionais.' : undefined}
      footer={
      step === 'resumo' ?
      <Button onClick={onClose}>Ver clientes</Button> :
      step === 'revisao' ?
      <>
            <Button variant="secondary" onClick={() => setStep('arquivo')}>
              Voltar
            </Button>
            <Button onClick={confirm} disabled={accepted === 0}>
              {accepted === 0 ? 'Nenhuma linha para importar' : `Importar ${plural(accepted, 'cliente', 'clientes')}`}
            </Button>
          </> :

      <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => setStep('revisao')} disabled={!review || !responsible || reading}>
              Conferir linhas
            </Button>
          </>

      }>
      
      {step === 'resumo' ?
      <div className="flex flex-col gap-3">
          <NoticeInline tone="success" role="status" title={`${plural(created, 'cliente importado', 'clientes importados')}`}>
            {rejected > 0 ? `${plural(rejected, 'linha ficou de fora', 'linhas ficaram de fora')} (motivos na conferência).` : 'Nenhuma linha ficou de fora.'}
          </NoticeInline>
          <p className="text-sm text-text-secondary">
            Os clientes já aparecem em Clientes. A planilha não registra consentimento de mensagens nem cria histórico de atendimento: a última visita e o serviço só foram conferidos.
          </p>
        </div> :
      step === 'revisao' && review ?
      <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            <strong className="text-text-primary">{review.fileName}</strong>: {plural(accepted, 'linha pronta', 'linhas prontas')} para importar e{' '}
            {plural(rejected, 'linha recusada', 'linhas recusadas')}.
          </p>
          <section aria-labelledby="imp-ok">
            <h3 id="imp-ok" className="text-sm font-bold text-text-primary">
              Vão entrar ({accepted})
            </h3>
            {accepted === 0 ?
          <p className="mt-1 text-sm text-text-muted">Nenhuma linha válida.</p> :

          <ul className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-button border border-border">
                {review.accepted.map((r) =>
            <li key={r.line} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="font-semibold text-text-primary">{r.name}</span>
                    <span className="text-text-secondary">
                      {r.phone}
                      {r.email ? ` · ${r.email}` : ''}
                      {r.lastVisit ? ` · última visita ${r.lastVisit}` : ''}
                      {r.service ? ` · ${r.service}${r.note ? ` (${r.note})` : ''}` : ''}
                    </span>
                  </li>
            )}
              </ul>
          }
          </section>
          {rejected > 0 &&
        <section aria-labelledby="imp-bad">
              <h3 id="imp-bad" className="text-sm font-bold text-text-primary">
                Ficam de fora ({rejected})
              </h3>
              <ul className="mt-2 max-h-40 divide-y divide-border overflow-y-auto rounded-button border border-border">
                {review.rejected.map((r) =>
            <li key={r.line} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="text-text-primary">
                      Linha {r.line}: {r.name || 'sem nome'}
                    </span>
                    <span className="font-semibold text-error">{r.reason}</span>
                  </li>
            )}
              </ul>
            </section>
        }
        </div> :

      <div className="flex flex-col gap-4">
          <input ref={inputRef} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Escolher planilha" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center transition-colors hover:border-primary hover:bg-primary-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          
            {file ?
          <>
                <FileSpreadsheetIcon className="h-6 w-6 text-primary" aria-hidden="true" />
                <span className="text-sm font-bold text-text-primary">{file.name}</span>
                <span className="text-xs text-text-secondary">{reading ? 'Lendo a planilha…' : 'Clique para trocar o arquivo'}</span>
              </> :

          <>
                <UploadIcon className="h-6 w-6 text-text-muted" aria-hidden="true" />
                <span className="text-sm font-bold text-text-primary">Escolher arquivo</span>
                <span className="text-xs text-text-secondary">.csv ou .xlsx, até 5 MB</span>
              </>
          }
          </button>
          {error &&
        <NoticeInline tone="error" role="alert" title="Não deu para usar esta planilha">
              {error}
            </NoticeInline>
        }
          {review && !error &&
        <NoticeInline tone="info" role="status" title={`${plural(review.accepted.length, 'linha pronta', 'linhas prontas')} · ${plural(review.rejected.length, 'recusada', 'recusadas')}`}>
              Em “Conferir linhas” você vê cada uma antes de importar.
            </NoticeInline>
        }
          <button type="button" onClick={downloadTemplate} className={`${cardButton} self-start`}>
            <DownloadIcon className="h-4 w-4" aria-hidden="true" />
            Baixar modelo de planilha
          </button>
          <Checkbox
          checked={responsible}
          onChange={(checked: boolean) => setResponsible(checked)}
          label={`Confirmo que ${currentWords().the} é responsável pelo uso destes dados. Importar não autoriza mensagens: o consentimento de cada cliente continua não registrado.`} />
        
        </div>
      }
    </AppModal>);

}