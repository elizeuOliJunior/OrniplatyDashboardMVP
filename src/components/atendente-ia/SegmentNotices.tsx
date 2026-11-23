import React from 'react';
import { Alert } from '../Card';
import { Button } from '../Button';
import { SEGMENT_CHANGE_TITLE, businessLabel, segmentChangeNote } from '../../data/segment';
import { dismissMigratedNotice, dismissServicesNotice, empresaStore, useSegmentNotices } from '../../data/empresa';
import { useSavedStore } from '../../data/iaConfigStore';

/**
 * G4 (F-062): avisos do segmento (Empresa, Serviços e equipe › Serviços e primeiro acesso).
 * - "Confira o segmento": um valor antigo foi convertido (ex.: "estetica" → Clínica · Estética). Aparece até a pessoa fechar.
 * - "Seus serviços continuam; quer revisar as áreas?": o segmento mudou com serviços cadastrados. Nada foi apagado nem trocado;
 *   cada serviço mantém a área original, que continua na lista.
 */
export function SegmentNotices({ onReviewAreas, showServices = true, className = '' }: {onReviewAreas?: () => void;showServices?: boolean;className?: string;}) {
  const n = useSegmentNotices();
  const e = useSavedStore(empresaStore);
  const label = businessLabel(e.segment, e.specialty);
  if (!n.migratedFrom && !(showServices && n.changedServices)) return null;
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {n.migratedFrom &&
      <Alert variant="info" compact title="Confira o segmento" onDismiss={dismissMigratedNotice}>
          A configuração trazia “{n.migratedFrom}”, que hoje corresponde a {label}. Se não for isso, troque em IA Orniplaty › Empresa.
        </Alert>
      }
      {showServices && n.changedServices > 0 &&
      <Alert
        variant="info"
        compact
        title={SEGMENT_CHANGE_TITLE}
        onDismiss={dismissServicesNotice}
        actions={
        onReviewAreas ?
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            dismissServicesNotice();
            onReviewAreas();
          }}>
          
                Revisar as áreas
              </Button> :
        undefined
        }>
        
          {segmentChangeNote(n.changedServices)}
        </Alert>
      }
    </div>);

}