import { useState } from 'react';
import {
  Files, Building2, Home, ChevronDown, ChevronRight, FileText, Image as ImageIcon,
  CloudUpload, HardDriveUpload, Loader2, CheckCircle2, FolderOpen,
  Link2, Unlink, Settings2, AlertTriangle, UploadCloud, User, SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Layout from '@/components/Layout';
import { MONTHS, formatDate } from '@/lib/utils-app';
import { useAllDocuments, fetchDocumentBytes, DocumentDB } from '@/hooks/useDocuments';
import { useTenants, useAllPreviousTenants } from '@/hooks/useTenants';
import { useApartments } from '@/hooks/useApartments';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useGoogleDrive, DriveConfig } from '@/hooks/useGoogleDrive';
import { toast } from 'sonner';

const DRIVE_CONFIG_KEY = 'livinggest_drive_config';

function loadDriveConfig(): DriveConfig | null {
  try { return JSON.parse(localStorage.getItem(DRIVE_CONFIG_KEY) ?? 'null'); } catch { return null; }
}

interface EnrichedDoc extends DocumentDB {
  condoId: string;
  condoName: string;
  aptId: string;
  aptUnit: string;
  tenantFullName: string;
}

interface TenantGroup { name: string; docs: EnrichedDoc[] }
interface AptGroup    { unit: string; tenants: Record<string, TenantGroup> }
interface CondoGroup  { name: string; apts: Record<string, AptGroup> }

export default function Documents() {
  const { data: allDocs = [], isLoading } = useAllDocuments();
  const { data: allTenants = [] }         = useTenants();
  const { data: previousTenants = [] }    = useAllPreviousTenants();
  const { data: apartments = [] }         = useApartments();
  const { data: condominiums = [] }       = useCondominiums();
  const drive = useGoogleDrive();

  const [driveConfig, setDriveConfig] = useState<DriveConfig | null>(loadDriveConfig);
  const [showConfig, setShowConfig]   = useState(false);
  const [cfgInput, setCfgInput]       = useState({ folderId: '', folderName: '' });
  const [backing, setBacking]         = useState(false);
  const [progress, setProgress]       = useState<{ phase: 'fetch' | 'upload'; done: number; total: number; skipped: number } | null>(null);
  const [expandedCondos, setExpandedCondos] = useState<Set<string>>(new Set());
  const [expandedApts, setExpandedApts]     = useState<Set<string>>(new Set());
  const [backedUpIds, setBackedUpIds]       = useState<Set<string>>(new Set());

  // ── Enriquecimento ────────────────────────────────────────────────────────
  const enriched: EnrichedDoc[] = allDocs.flatMap(doc => {
    const activeTenant = allTenants.find(t => t.id === doc.tenant_id);
    const prevTenant   = !activeTenant
      ? (previousTenants as any[]).find((pt: any) => pt.original_id === doc.tenant_id)
      : null;

    if (!activeTenant && !prevTenant) return [];

    const tenantFullName = activeTenant
      ? `${activeTenant.first_name} ${activeTenant.last_name}`
      : `${prevTenant.first_name} ${prevTenant.last_name}`;

    const aptId = activeTenant?.apartment_id ?? prevTenant?.apartment_id ?? '';
    const apt   = apartments.find(a => a.id === aptId);
    if (!apt) return [];

    const condo = condominiums.find(c => c.id === apt.condominium_id);
    if (!condo) return [];

    return [{ ...doc, condoId: condo.id, condoName: condo.name, aptId: apt.id, aptUnit: apt.unit_number, tenantFullName }];
  });

  // ── Agrupamento ─────────────────────────────────────────────────────────
  const grouped = enriched.reduce<Record<string, CondoGroup>>((acc, doc) => {
    if (!acc[doc.condoId]) acc[doc.condoId] = { name: doc.condoName, apts: {} };
    if (!acc[doc.condoId].apts[doc.aptId]) acc[doc.condoId].apts[doc.aptId] = { unit: doc.aptUnit, tenants: {} };
    if (!acc[doc.condoId].apts[doc.aptId].tenants[doc.tenant_id])
      acc[doc.condoId].apts[doc.aptId].tenants[doc.tenant_id] = { name: doc.tenantFullName, docs: [] };
    acc[doc.condoId].apts[doc.aptId].tenants[doc.tenant_id].docs.push(doc);
    return acc;
  }, {});

  const totalDocs  = enriched.length;
  const totalCondos = Object.keys(grouped).length;
  const totalApts   = Object.values(grouped).reduce((s, c) => s + Object.keys(c.apts).length, 0);

  // ── Backup Drive ─────────────────────────────────────────────────────────
  async function handleBackup() {
    if (!driveConfig) { toast.error('Configure a pasta do Drive primeiro.'); return; }
    if (!enriched.length) { toast.error('Nenhum documento encontrado.'); return; }
    setBacking(true);
    try {
      // Fase 1: baixar bytes do Supabase Storage
      const filesToUpload: Array<{
        condoName: string; aptUnit: string; tenantName: string;
        year: number; monthLabel: string; fileName: string;
        fileBytes: Uint8Array; mimeType: string;
      }> = [];

      let fetchFailed = 0;
      for (let i = 0; i < enriched.length; i++) {
        setProgress({ phase: 'fetch', done: i, total: enriched.length, skipped: 0 });
        const doc = enriched[i];
        const result = await fetchDocumentBytes(doc.file_url);
        if (!result) { fetchFailed++; continue; }
        const parts = doc.uploaded_at.split('-').map(Number);
        const year = parts[0];
        const monthNum = parts[1];
        filesToUpload.push({
          condoName:   doc.condoName,
          aptUnit:     doc.aptUnit,
          tenantName:  doc.tenantFullName.replace(/\s+/g, '_'),
          year,
          monthLabel:  `${MONTHS[monthNum - 1]} ${year}`,
          fileName:    doc.file_name,
          fileBytes:   result.bytes,
          mimeType:    result.mimeType,
        });
      }

      if (!filesToUpload.length) {
        toast.error('Nenhum arquivo pôde ser baixado. Verifique o bucket "tenant-documents" no Supabase.');
        return;
      }

      // Fase 2: enviar ao Drive
      setProgress({ phase: 'upload', done: 0, total: filesToUpload.length, skipped: 0 });
      const result = await drive.uploadDocuments(
        filesToUpload,
        driveConfig,
        (done, total, skipped) => setProgress({ phase: 'upload', done, total, skipped }),
      );

      if (result.skipped > 0 && result.uploaded === 0) {
        toast.info(`Todos os ${result.skipped} arquivo(s) já existem no Drive!`);
      } else if (result.skipped > 0 && result.uploaded > 0) {
        toast.success(`${result.uploaded} enviado(s), ${result.skipped} já existia(m)${result.failed > 0 ? `, ${result.failed} falharam` : ''}.`);
      } else if (result.failed > 0) {
        toast.warning(`${result.uploaded} enviado(s), ${result.failed} falharam.`);
      } else {
        toast.success(`${result.uploaded} documento(s) enviado(s) ao Drive!`);
      }

      if (fetchFailed > 0) {
        toast.warning(`${fetchFailed} arquivo(s) não puderam ser lidos do storage.`);
      }

      setBackedUpIds(prev => {
        const next = new Set(prev);
        enriched.forEach(d => next.add(d.id));
        return next;
      });

    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setBacking(false);
      setProgress(null);
    }
  }

  function handleSaveConfig() {
    let id = cfgInput.folderId.trim();
    const m = id.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (m) id = m[1];
    if (!id) { toast.error('Cole o link ou ID da pasta raiz do Drive.'); return; }
    const cfg = { rootFolderId: id, rootFolderName: cfgInput.folderName.trim() || 'Condomínios' };
    localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(cfg));
    setDriveConfig(cfg);
    setShowConfig(false);
    toast.success('Configuração salva!');
  }

  function toggleCondo(id: string) {
    setExpandedCondos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleApt(id: string) {
    setExpandedApts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const progressLabel = progress
    ? progress.phase === 'fetch'
      ? `Baixando arquivos... ${progress.done}/${progress.total}`
      : `Enviando ao Drive... ${progress.done}/${progress.total}${progress.skipped > 0 ? ` (${progress.skipped} já existia${progress.skipped !== 1 ? 'm' : ''})` : ''}`
    : '';

  const progressPct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <Layout>
      <div className="page-content">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Files className="w-6 h-6 text-primary" /> Documentos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Visualize e faça backup dos documentos dos inquilinos no Google Drive.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Documentos', value: totalDocs, icon: FileText },
            { label: 'Condomínios', value: totalCondos, icon: Building2 },
            { label: 'Apartamentos', value: totalApts, icon: Home },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Drive Config */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CloudUpload className="w-4 h-4 text-primary" /> Backup Google Drive
          </h2>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Pasta raiz */}
            <div className={`flex-1 flex items-center gap-3 rounded-xl px-4 py-3 border ${driveConfig ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
              <FolderOpen className={`w-5 h-5 shrink-0 ${driveConfig ? 'text-green-500' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pasta raiz</p>
                <p className="text-sm font-medium truncate">{driveConfig?.rootFolderName ?? 'Não configurada'}</p>
                {driveConfig && <p className="text-xs text-muted-foreground font-mono truncate">{driveConfig.rootFolderId}</p>}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setCfgInput({ folderId: driveConfig?.rootFolderId ?? '', folderName: driveConfig?.rootFolderName ?? '' }); setShowConfig(true); }}>
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            {/* OAuth */}
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${drive.connected ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
              {drive.connected ? (
                <><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-sm font-medium text-green-600 mr-1">Conectado</span>
                <Button size="sm" variant="ghost" className="text-muted-foreground h-7 px-2" onClick={drive.disconnect}><Unlink className="w-3.5 h-3.5" /></Button></>
              ) : (
                <><Link2 className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground mr-1">Não conectado</span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => drive.connect().catch((e: Error) => toast.error(e.message))} disabled={drive.connecting}>
                  {drive.connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Conectar'}
                </Button></>
              )}
            </div>
          </div>

          {!driveConfig && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Configure a pasta raiz do Drive. Use a mesma pasta configurada em Recibos para manter tudo organizado.</p>
            </div>
          )}

          {/* Preview estrutura */}
          {driveConfig && totalDocs > 0 && (
            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-xs font-mono text-muted-foreground space-y-0.5">
              <p className="font-semibold text-foreground text-xs mb-1">Estrutura que será criada no Drive:</p>
              <p>📁 {driveConfig.rootFolderName}</p>
              {Object.entries(grouped).slice(0, 2).map(([cId, condo]) => (
                <div key={cId} className="ml-3 space-y-0.5">
                  <p>📁 {condo.name}</p>
                  <p className="ml-4">📁 Documentos</p>
                  {Object.entries(condo.apts).slice(0, 1).map(([aId, apt]) => (
                    <div key={aId} className="ml-8 space-y-0.5">
                      <p>📁 Apto {apt.unit}</p>
                      <p className="ml-4">📁 2026 &rsaquo; Junho 2026</p>
                      <p className="ml-8 text-muted-foreground/60">📁 Documentos_NomeInquilino &rsaquo; arquivo.pdf</p>
                    </div>
                  ))}
                </div>
              ))}
              {Object.keys(grouped).length > 2 && <p className="ml-3 text-muted-foreground/50">...</p>}
            </div>
          )}

          {/* Progresso */}
          {progress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progressLabel}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          <Button
            className="w-full gap-2" size="lg"
            onClick={handleBackup}
            disabled={backing || !totalDocs || !driveConfig}
          >
            {backing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Processando...</>
              : <><HardDriveUpload className="w-4 h-4" />Enviar {totalDocs || ''} documento{totalDocs !== 1 ? 's' : ''} ao Drive</>
            }
          </Button>
        </div>

        {/* Árvore de documentos */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Todos os Documentos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Organizados por condomínio e apartamento</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : !totalDocs ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum documento encontrado</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Adicione documentos pela aba Documentos de cada apartamento.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(grouped).map(([condoId, condo]) => {
                const condoDocCount = Object.values(condo.apts).reduce((s, a) =>
                  s + Object.values(a.tenants).reduce((ss, t) => ss + t.docs.length, 0), 0);
                const condoExpanded = expandedCondos.has(condoId);

                return (
                  <div key={condoId}>
                    {/* Condo row */}
                    <button
                      onClick={() => toggleCondo(condoId)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{condo.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {Object.keys(condo.apts).length} apto{Object.keys(condo.apts).length !== 1 ? 's' : ''} · {condoDocCount} doc{condoDocCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {condoExpanded
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>

                    {condoExpanded && (
                      <div className="bg-muted/20">
                        {Object.entries(condo.apts).map(([aptId, apt]) => {
                          const aptDocCount = Object.values(apt.tenants).reduce((s, t) => s + t.docs.length, 0);
                          const aptExpanded = expandedApts.has(aptId);

                          return (
                            <div key={aptId} className="border-t border-border/50">
                              {/* Apt row */}
                              <button
                                onClick={() => toggleApt(aptId)}
                                className="w-full flex items-center gap-3 pl-12 pr-5 py-3 hover:bg-muted/50 transition-colors text-left"
                              >
                                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <Home className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">Apto {apt.unit}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {Object.keys(apt.tenants).length} inquilino{Object.keys(apt.tenants).length !== 1 ? 's' : ''} · {aptDocCount} doc{aptDocCount !== 1 ? 's' : ''}
                                  </p>
                                </div>
                                {aptExpanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                              </button>

                              {aptExpanded && (
                                <div className="bg-background/60">
                                  {Object.entries(apt.tenants).map(([tenantId, tenant]) => (
                                    <div key={tenantId} className="border-t border-border/30 pl-20 pr-5 py-3 space-y-2">
                                      {/* Tenant header */}
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                          <User className="w-3 h-3 text-primary" />
                                        </div>
                                        <p className="text-xs font-semibold text-foreground">{tenant.name}</p>
                                        <span className="text-xs text-muted-foreground">· {tenant.docs.length} doc{tenant.docs.length !== 1 ? 's' : ''}</span>
                                      </div>

                                      {/* Doc list */}
                                      <div className="space-y-1.5 pl-8">
                                        {tenant.docs.map(doc => (
                                          <div key={doc.id} className="flex items-center gap-2">
                                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${doc.file_type === 'pdf' ? 'bg-red-50' : 'bg-blue-50'}`}>
                                              {doc.file_type === 'pdf'
                                                ? <FileText className="w-3 h-3 text-red-500" />
                                                : <ImageIcon className="w-3 h-3 text-blue-500" />}
                                            </div>
                                            <p className="text-xs truncate flex-1 text-muted-foreground">{doc.file_name}</p>
                                            <p className="text-xs text-muted-foreground/60 shrink-0">{doc.uploaded_at.substring(0, 10).split('-').reverse().join('/')}</p>
                                            {backedUpIds.has(doc.id) && (
                                              <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                                                <CheckCircle2 className="w-3 h-3" /> Drive
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal configuração Drive */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UploadCloud className="w-5 h-5 text-primary" />Configurar Pasta do Drive</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Link ou ID da pasta raiz *</Label>
              <Input className="mt-1 font-mono text-xs" placeholder="https://drive.google.com/drive/folders/1IJm0... ou só o ID"
                value={cfgInput.folderId} onChange={e => setCfgInput(p => ({ ...p, folderId: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">Use a mesma pasta configurada em Recibos para compartilhar a estrutura.</p>
            </div>
            <div>
              <Label>Nome da pasta raiz <span className="text-muted-foreground font-normal">(para exibição)</span></Label>
              <Input className="mt-1" placeholder="Condomínios"
                value={cfgInput.folderName} onChange={e => setCfgInput(p => ({ ...p, folderName: e.target.value }))} />
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Estrutura criada automaticamente:</p>
              <p>📁 {cfgInput.folderName || 'Condomínios'} ← sua pasta raiz</p>
              <p className="ml-4">📁 Roseno Lopes / 📁 Sítio Córrego / ...</p>
              <p className="ml-8">📁 Documentos</p>
              <p className="ml-12">📁 980-4 (número do apto)</p>
              <p className="ml-16">📁 2026 &rsaquo; Junho 2026</p>
              <p className="ml-20">📁 Documentos_Lucelia_Assis</p>
              <p className="ml-24">Contrato.pdf</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>Cancelar</Button>
            <Button onClick={handleSaveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
