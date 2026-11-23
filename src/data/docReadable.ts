/**
 * G4 (F-066): leitura de verdade do arquivo enviado em Conhecimento (sem atraso fixo). "Lendo" dura o tempo de ler o arquivo.
 * Regras simples, só no navegador (nada é enviado):
 * - .txt: tem texto além de espaços → "Pronto"; vazio → "Não lido".
 * - .pdf: tem fonte de texto (`/Font`) → "Pronto"; sem fonte (PDF escaneado, só imagem) → "Não lido".
 * - .docx: é um Word válido (contém `word/document.xml`) → "Pronto"; senão → "Não lido".
 * G6: no produto quem lê é o backend (ai/document_parser.py, histórico); estas regras só aproximam o resultado na tela.
 */
export async function isReadableDocument(file: File, type: 'pdf' | 'docx' | 'txt'): Promise<boolean> {
  try {
    if (type === 'txt') return (await readText(file)).trim().length > 0;
    const bytes = new Uint8Array(await readBuffer(file));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
    if (type === 'pdf') return s.startsWith('%PDF') && /\/Font\b/.test(s);
    return s.startsWith('PK') && s.includes('word/document.xml');
  } catch {
    return false;
  }
}

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ''));
    r.onerror = () => fail(r.error);
    r.readAsText(file);
  });
}
function readBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as ArrayBuffer);
    r.onerror = () => fail(r.error);
    r.readAsArrayBuffer(file);
  });
}