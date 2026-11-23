import React from 'react';
import { Alert } from '../Card';
import { Button } from '../Button';
import { useLoadFailure } from '../../data/failures';

/**
 * G4 (F-066): estado de erro recuperável de uma lista (DS: `Alert` error + "Tentar de novo"). Sem falha, mostra o conteúdo.
 * O erro aparece no lugar da lista; filtros e cabeçalho da tela continuam.
 */
export function LoadErrorGate({ k, what, children, className = '' }: {k: string;what: string;children: React.ReactNode;className?: string;}) {
  const { failed, retry } = useLoadFailure(k);
  if (!failed) return <>{children}</>;
  return (
    <Alert
      className={className}
      variant="error"
      title={`Não foi possível carregar ${what}`}
      actions={
      <Button size="md" onClick={retry}>
          Tentar de novo
        </Button>
      }>
      
      A conexão falhou antes de os dados chegarem. Nada foi perdido: tente de novo.
    </Alert>);

}