import React from 'react';
import { Navigate } from 'react-router-dom';

/** Nível de IA saiu do Painel até a definição comercial (C1, 19/10/2026). A rota antiga leva para Empresa. */
export function AtendenteIaNivel() {
  return <Navigate to="/atendente-ia/empresa" replace />;
}