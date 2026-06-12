import { useState, useCallback, useRef } from 'react';
import { MONTHS } from '@/lib/utils-app';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

export interface DriveConfig {
  rootFolderId: string;
  rootFolderName: string;
}

export interface DriveUploadResult {
  uploaded: number;
  failed: number;
  errors: string[];
}

export interface DriveDocUploadResult extends DriveUploadResult {
  skipped: number;
}

function loadGISScript(): Promise<void> {
  if (document.getElementById('gis-script')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Identity Services'));
    document.head.appendChild(script);
  });
}

async function driveGet(url: string, token: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

/** Busca pasta por nome dentro de um pai. */
async function findFolder(name: string, parentId: string, token: string): Promise<string | null> {
  const q = `name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name)');
  url.searchParams.set('pageSize', '10');
  const res = await driveGet(url.toString(), token);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive busca falhou (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/** Busca arquivo (não pasta) por nome dentro de um pai — para verificar duplicatas. */
async function findFile(name: string, parentId: string, token: string): Promise<string | null> {
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${safeName}' and '${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name)');
  url.searchParams.set('pageSize', '5');
  const res = await driveGet(url.toString(), token);
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string, token: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Erro ao criar pasta "${name}": ${await res.text()}`);
  return (await res.json()).id;
}

async function ensureFolder(name: string, parentId: string, token: string): Promise<string> {
  return (await findFolder(name, parentId, token)) ?? (await createFolder(name, parentId, token));
}

/** Upload de PDF (mantido para compatibilidade com uploadReceipts). */
async function uploadPDF(name: string, bytes: Uint8Array, parentId: string, token: string): Promise<void> {
  const meta = JSON.stringify({ name, parents: [parentId] });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', new Blob([bytes], { type: 'application/pdf' }));
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  if (!res.ok) throw new Error(`Falha ao enviar "${name}": ${await res.text()}`);
}

/** Upload genérico com tipo MIME customizado (para documentos). */
async function uploadFile(
  name: string,
  bytes: Uint8Array,
  mimeType: string,
  parentId: string,
  token: string
): Promise<void> {
  const meta = JSON.stringify({ name, parents: [parentId] });
  const form = new FormData();
  form.append('metadata', new Blob([meta], { type: 'application/json' }));
  form.append('file', new Blob([bytes], { type: mimeType }));
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  if (!res.ok) throw new Error(`Falha ao enviar "${name}": ${await res.text()}`);
}

export function useGoogleDrive() {
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const clientRef = useRef<any>(null);

  const connect = useCallback((): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      setConnecting(true);
      try {
        await loadGISScript();
        if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID não configurado nas variáveis de ambiente do Vercel.');
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (resp: any) => {
            setConnecting(false);
            if (resp.error) { reject(new Error(resp.error_description ?? resp.error)); return; }
            setToken(resp.access_token);
            resolve(resp.access_token);
          },
        });
        clientRef.current = client;
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        setConnecting(false);
        reject(err);
      }
    });
  }, []);

  const disconnect = useCallback(() => {
    if (token) (window as any).google?.accounts?.oauth2?.revoke(token, () => {});
    setToken(null);
  }, [token]);

  /** Upload de recibos (PDFs gerados em memória). */
  async function uploadReceipts(
    files: Array<{
      condoName: string;
      aptUnit: string;
      tenantName: string;
      month: string;
      pdfBytes: Uint8Array;
      subFolder?: string;
      fileName?: string;
    }>,
    config: DriveConfig,
    onProgress?: (done: number, total: number) => void
  ): Promise<DriveUploadResult> {
    const tok = token ?? await connect();
    const result: DriveUploadResult = { uploaded: 0, failed: 0, errors: [] };
    const cache = new Map<string, string>();

    async function cached(key: string, name: string, parentId: string): Promise<string> {
      if (!cache.has(key)) cache.set(key, await ensureFolder(name, parentId, tok));
      return cache.get(key)!;
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      onProgress?.(i, files.length);
      try {
        const [year, monthNum] = f.month.split('-').map(Number);
        const monthLabel = `${MONTHS[monthNum - 1]} ${year}`;
        const condoId   = await cached(`c:${f.condoName}`,            f.condoName,  config.rootFolderId);
        const recibosId = await cached(`r:${f.condoName}`,            'Recibos',    condoId);
        const yearId    = await cached(`y:${f.condoName}:${year}`,    String(year), recibosId);
        const monthId   = await cached(`m:${f.condoName}:${f.month}`, monthLabel,   yearId);
        const targetId  = f.subFolder
          ? await cached(`s:${f.condoName}:${f.month}:${f.subFolder}`, f.subFolder, monthId)
          : monthId;
        const safeName  = f.fileName ?? `Recibo_${f.aptUnit}_${f.tenantName}.pdf`;
        await uploadPDF(safeName.replace(/\s+/g, '_'), f.pdfBytes, targetId, tok);
        result.uploaded++;
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${f.aptUnit}: ${err.message}`);
      }
    }
    onProgress?.(files.length, files.length);
    return result;
  }

  /**
   * Upload de documentos de inquilinos com verificação de duplicatas.
   *
   * Estrutura no Drive:
   * Root > {Condo} > {Apt} > {Ano} > {Mês} > Documentos_{NomeInquilino} > {arquivo}
   */
  async function uploadDocuments(
    files: Array<{
      condoName: string;
      aptUnit: string;
      tenantName: string;
      year: number;
      monthLabel: string;
      fileName: string;
      fileBytes: Uint8Array;
      mimeType: string;
    }>,
    config: DriveConfig,
    onProgress?: (done: number, total: number, skipped: number) => void
  ): Promise<DriveDocUploadResult> {
    const tok = token ?? await connect();
    const result: DriveDocUploadResult = { uploaded: 0, failed: 0, errors: [], skipped: 0 };
    const cache = new Map<string, string>();

    async function cached(key: string, name: string, parentId: string): Promise<string> {
      if (!cache.has(key)) cache.set(key, await ensureFolder(name, parentId, tok));
      return cache.get(key)!;
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      onProgress?.(i, files.length, result.skipped);
      try {
        // Root > Condo > Documentos > Apt > Ano > Mês > Documentos_NomeInquilino
        const condoId     = await cached(`c:${f.condoName}`, f.condoName, config.rootFolderId);
        const docsRootId  = await cached(`dr:${f.condoName}`, 'Documentos', condoId);
        const aptId       = await cached(`a:${f.condoName}:${f.aptUnit}`, f.aptUnit, docsRootId);
        const yearId      = await cached(`y:${f.condoName}:${f.aptUnit}:${f.year}`, String(f.year), aptId);
        const monthId     = await cached(`m:${f.condoName}:${f.aptUnit}:${f.year}:${f.monthLabel}`, f.monthLabel, yearId);
        const docFolder   = `Documentos_${f.tenantName.replace(/\s+/g, '_')}`;
        const docFolderId = await cached(
          `d:${f.condoName}:${f.aptUnit}:${f.year}:${f.monthLabel}:${f.tenantName}`,
          docFolder,
          monthId
        );

        const safeName = f.fileName.replace(/\s+/g, '_');

        // Anti-duplicata: verifica se o arquivo já existe na pasta de destino
        const existingId = await findFile(safeName, docFolderId, tok);
        if (existingId) {
          result.skipped++;
          continue;
        }

        await uploadFile(safeName, f.fileBytes, f.mimeType, docFolderId, tok);
        result.uploaded++;
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${f.fileName}: ${err.message}`);
      }
    }
    onProgress?.(files.length, files.length, result.skipped);
    return result;
  }

  return {
    token,
    connected: !!token,
    connecting,
    connect,
    disconnect,
    uploadReceipts,
    uploadDocuments,
  };
}
