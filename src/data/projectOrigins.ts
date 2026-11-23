/**
 * Origens dos dois protótipos Magic Patterns (fonte ÚNICA no Painel).
 *
 * Cada versão publicada no Magic Patterns tem a própria origem de preview: `https://<id-do-artefato>-render.magicpatterns.app`.
 * Lote RV13 (20/11/2026, religação depois do Update para o DS ORNIPLATY 6.5): par atual Painel f999894a (editor
 * xcegwfqg4m6jzupjneailk; v211, DS 6.5 e RV13) ↔ Onboarding 73a7019a (editor hrsygbhj2enmnq2sch9xcn; v73). Este id não mudou.
 * Par anterior (RL1, 19/11/2026): Painel 3eccc19a (v210, DS 6.4 e RV2B) ↔ este mesmo Onboarding 73a7019a.
 * Etapa de design (13–19/11/2026): ver `docs/etapa-design-2026-11.md` (vale sobre o
 * CLAUDE.md onde divergirem).
 * Anterior (ponto de volta): 22ef5d45-475f-44cd-8afa-8e8ba407be65 (18–19/11/2026, Onboarding do L22, mudado no L22c, ligado
 * no L22d e usado até o L24h, com os Painéis 150c9ff5 e a68c505f).
 * Antes dele: 3afd9e19-151f-4d01-8a55-bce48eceb9ce (17/11/2026, Onboarding do L20, com o Painel 59389a34; os
 * Painéis do L21, bb1aabd9, e do DS 6.1, ebe071ae, ainda apontavam para ele).
 * Antes dele: c0b76d43-0668-4c39-a1c0-9c463c1e2fad (17/11/2026, Onboarding do L17, com o Painel 58d5e136; os
 * Painéis do L18 e do L19, 33312c7f e 0c64f707, ainda apontavam para ele).
 * Antes dele: fd4b0950-3e95-498c-8ba2-cc1ecc657c16 (12/11/2026, Onboarding da rodada W9, com o Painel 9726b346).
 * Antes dele: 5ad5dd30-4e92-4122-a7d4-1d994c88a6bf (11/11/2026, Onboarding da I2, usado da I2 ao I4, com o Painel 25fc0bb7).
 * Antes dele: 99ef0674-7b50-4e57-857a-d2b7168804c9 (11/11/2026, Onboarding da integração I1, com o Painel 441483c2).
 * Antes dele: 0c031503-ab2c-4219-8a6a-e0438358f804 (11/11/2026, Onboarding original, com o Painel 8ea78f9a, DS v4.3).
 * A lista completa dos ids mais antigos está neste mesmo arquivo no artefato 2ea761c4 (v174, lote W3) e no histórico de versões.
 * Ao publicar uma nova versão do Onboarding, atualize SOMENTE este id.
 *
 * G4: a mensagem só é aceita da origem exata acima, com o token da sessão e da janela que abriu o Painel. Na integração
 * real, a origem é fixa (domínio de produção) e este handoff por postMessage é substituído por dados persistidos no backend.
 */
export const ONBOARDING_ARTIFACT_ID = '73a7019a-1500-4d89-a7fe-bf8e64ed29e3';
export const ONBOARDING_ORIGIN = `https://${ONBOARDING_ARTIFACT_ID}-render.magicpatterns.app`;

/** G4 (F-071): só a origem EXATA do Onboarding pareado é aceita (antes, qualquer prévia do Magic Patterns). */
export function isOnboardingOrigin(origin: string) {
  return origin === ONBOARDING_ORIGIN;
}