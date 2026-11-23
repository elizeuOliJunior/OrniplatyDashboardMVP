import React from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ScreenSwitcher } from './components/dashboard/ScreenSwitcher';
import { Inicio } from './pages/Inicio';
import { InicioPrimeiroAcesso } from './pages/InicioPrimeiroAcesso';
import { Agenda } from './pages/Agenda';
import { Conversas } from './pages/Conversas';
import { Clientes } from './pages/Clientes';
import { FichaCliente } from './pages/FichaCliente';
import { ClientesPacotes } from './pages/ClientesPacotes';
import { Oportunidades } from './pages/Oportunidades';
import { Resultados } from './pages/Resultados';
import { AtendenteIaAutomacoes } from './pages/AtendenteIaAutomacoes';
import { AtendenteIaComoAtender } from './pages/AtendenteIaComoAtender';
import { AtendenteIaEmpresa } from './pages/AtendenteIaEmpresa';
import { AtendenteIaConhecimento } from './pages/AtendenteIaConhecimento';
import { ServicosEquipe } from './pages/ServicosEquipe';
import { Configuracoes } from './pages/Configuracoes';
import { dashboardScreens } from './data/dashboardScreens';
import { ToastProvider } from './components/ui/Toast';
import { TooltipEdgeGuard } from './components/ui/TooltipEdgeGuard';
import { ToastPlacementGuard } from './components/ui/ToastPlacementGuard';
import { ThemeHost } from './components/ui/ThemeHost';

// Screen ids (from data/dashboardScreens) that are already built.
// Nível de IA saiu do Painel até a definição comercial (decisão C1, 19/10/2026): a rota antiga leva para Empresa.
// Clientes › Retornos saiu do Painel (ajustes do Lote C, C1, 21/10/2026): /clientes/retornos leva a Oportunidades com o filtro Retorno.
const available: string[] = [
'inicio',
'inicio-primeiro-acesso',
'agenda',
'conversas',
'clientes',
'ficha-cliente',
'clientes-pacotes',
'oportunidades',
'resultados',
'atendente-ia-empresa',
'atendente-ia-como-atender',
'atendente-ia-conhecimento',
'atendente-ia-automacoes',
'servicos-equipe',
'configuracoes'];


const screenElements: Record<string, React.ReactNode> = {
  inicio: <Inicio />,
  'inicio-primeiro-acesso': <InicioPrimeiroAcesso />,
  agenda: <Agenda />,
  conversas: <Conversas />,
  clientes: <Clientes />,
  'ficha-cliente': <FichaCliente />,
  'clientes-pacotes': <ClientesPacotes />,
  oportunidades: <Oportunidades />,
  resultados: <Resultados />,
  'atendente-ia-empresa': <AtendenteIaEmpresa />,
  'atendente-ia-como-atender': <AtendenteIaComoAtender />,
  'atendente-ia-conhecimento': <AtendenteIaConhecimento />,
  'atendente-ia-automacoes': <AtendenteIaAutomacoes />,
  'servicos-equipe': <ServicosEquipe />,
  configuracoes: <Configuracoes />
};

function ContextualSwitcher() {const location = useLocation();return location.pathname === '/inicio-primeiro-acesso' ? null : <ScreenSwitcher available={available} />;}

/**
 * T1 1b: `ToastProvider319` = cópia local do Toast do rascunho DS v3.19 (tom de erro), usada por Conversas.
 * T1 1f: `TooltipEdgeGuard` mantém todas as dicas (i) longe da borda da tela, priorizando abrir para baixo.
 * T1 1k: `ThemeHost` = camada do modo noturno para as cores fixas das peças locais (ver components/ui/ThemeHost.tsx).
 * L21 (17/11/2026): `ToastPlacementGuard` tira os avisos rápidos de cima do título e dos botões da janela aberta e dos
 * contadores da linha do topo (ver components/ui/ToastPlacementGuard.tsx).
 */
export function App() {
  return (
    <ToastProvider>
        <TooltipEdgeGuard />
        <ToastPlacementGuard />
        <ThemeHost />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            {dashboardScreens.map((screen) =>
          <Route
            key={screen.id}
            path={screen.path}
            element={
            available.includes(screen.id) && screenElements[screen.id] ?
            screenElements[screen.id] :

            <Navigate to="/inicio" replace />

            } />

          )}
            <Route path="/atendente-ia" element={<Navigate to="/atendente-ia/empresa" replace />} />
            <Route path="/atendente-ia/nivel" element={<Navigate to="/atendente-ia/empresa" replace />} />
            <Route path="/clientes/retornos" element={<Navigate to="/oportunidades?aba=retorno" replace />} />
            <Route path="/clientes/:clientId" element={<FichaCliente />} />
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
          <ContextualSwitcher />
        </HashRouter>
    </ToastProvider>);

}