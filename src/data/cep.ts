/**
 * G4 (F-064): busca de endereço pelo CEP, a mesma consulta pública que o Onboarding já usa (ViaCEP, 8 s de limite).
 * Só preenche o que voltou; sem resposta ou CEP desconhecido, a tela pede o preenchimento manual. Nenhum dado da empresa
 * é enviado além do CEP. G6: na integração, a busca passa pelo backend ou por um serviço aprovado (F-099).
 */
export type CepResult = {kind: 'ok';street: string;district: string;city: string;uf: string;} | {kind: 'not-found';} | {kind: 'unavailable';};

export async function lookupCep(digits: string): Promise<CepResult> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), 8000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return { kind: 'unavailable' };
    const a = await response.json();
    if (a?.erro) return { kind: 'not-found' };
    return { kind: 'ok', street: a.logradouro || '', district: a.bairro || '', city: a.localidade || '', uf: a.uf || '' };
  } catch {
    return { kind: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}