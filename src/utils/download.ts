/**
 * G4 (F-064/F-065/F-069): baixa um arquivo GERADO NO NAVEGADOR (Blob + link temporário). Nada sai do computador da pessoa
 * nem vai para um servidor. Usado por "Baixar modelo" da importação, exportação da lista de clientes e exportação de dados
 * do cliente. Devolve false se o navegador não permitir (ex.: sem `URL.createObjectURL`).
 */
export function downloadFile(fileName: string, content: BlobPart, mime: string): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** CSV com ponto e vírgula (abre certo no Excel em português) e BOM UTF-8 para os acentos. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** "ana-ribeiro" a partir de "Ana Ribeiro" (nome de arquivo sem acento nem espaço). */
export const fileSlug = (s: string) =>
s.
normalize('NFD').
replace(/[̀-ͯ]/g, '').
toLowerCase().
replace(/[^a-z0-9]+/g, '-').
replace(/^-|-$/g, '') || 'arquivo';