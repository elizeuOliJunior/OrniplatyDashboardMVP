import { currentWords } from '../data/empresa';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useScreenInit } from '../useScreenInit.js';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { SectionNav } from '../components/Card';
import { legacySection, settingsSections } from '../data/configuracoes';
import type { SettingsSection } from '../data/configuracoes';
import { pendingCountBySection, useSettings } from '../data/settingsStore';
import { requestLeave } from '../data/dirtyGuard';
import { VisaoGeralSection } from '../components/configuracoes/VisaoGeralSection';
import { WhatsAppSection } from '../components/configuracoes/WhatsAppSection';
import { PlanoSection } from '../components/configuracoes/PlanoSection';
import { ContaSection } from '../components/configuracoes/ContaSection';
import { AjudaSection } from '../components/configuracoes/SuporteSection';

/*
 * Tailwind deste projeto precisa gerar `lg:flex`: o SectionNav do design system usa "hidden lg:flex" e, como o CSS do Painel
 * vem depois do CSS do design system, o `.hidden` daqui venceria e a lista lateral sumia em telas grandes (achado no teste de 20/10/2026).
 */
const TAILWIND_KEEP = 'lg:flex';
void TAILWIND_KEEP;

/** Seção pedida por `?secao=` ou pelo canvas; nome antigo (ex.: "suporte") vira o novo; desconhecida abre a Visão geral. */
function toSection(value: unknown): SettingsSection {
  if (typeof value !== 'string') return 'geral';
  const v = legacySection[value] ?? value;
  return settingsSections.some((s) => s.value === v) ? v as SettingsSection : 'geral';
}

/**
 * Configurações (repaginada em 20/10/2026, claude/configuracoes-ux-pesquisa-2026-10-20.md + decisões do Christian):
 * Visão geral · WhatsApp · Plano e pagamento · Conta · Ajuda. Estado vivo em data/settingsStore.ts.
 * Navegação de seções = `SectionNav` do design system (v3.3).
 */
export function Configuracoes() {
  const screenInit = useScreenInit();
  const { search } = useLocation();
  const navigate = useNavigate();
  const settings = useSettings();
  const fromUrl = new URLSearchParams(search).get('secao');
  const [section, setSection] = useState<SettingsSection>(toSection(fromUrl ?? screenInit.configSection));

  // Links de outras telas (Início, menu, IA Orniplaty) abrem direto na seção certa, mesmo com a tela já aberta
  useEffect(() => {
    if (fromUrl) setSection(toSection(fromUrl));
  }, [fromUrl]);

  const counts = pendingCountBySection(settings);
  const open = (s: SettingsSection) =>
  requestLeave(() => {
    setSection(s);
    navigate(s === 'geral' ? '/configuracoes' : `/configuracoes?secao=${s}`, { replace: true });
    window.scrollTo({ top: 0 });
  });

  return (
    <DashboardLayout activeId="configuracoes" title="Configurações" subtitle={`Veja se está tudo funcionando e cuide da conta ${currentWords().of}: WhatsApp, assinatura, acesso e ajuda.`}>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <SectionNav
          ariaLabel="Seções das configurações"
          value={section}
          onValueChange={(v: string) => v !== section && open(v as SettingsSection)}
          items={settingsSections.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] }))} />
        
        <div className="min-w-0 flex-1">
          {section === 'geral' && <VisaoGeralSection onOpen={open} />}
          {section === 'whatsapp' && <WhatsAppSection />}
          {section === 'plano' && <PlanoSection />}
          {section === 'conta' && <ContaSection />}
          {section === 'ajuda' && <AjudaSection onOpen={open} />}
        </div>
      </div>
    </DashboardLayout>);

}