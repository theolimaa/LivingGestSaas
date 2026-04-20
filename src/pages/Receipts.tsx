import { useState } from 'react';
import {
  FileText, Download, Loader2, Package, CheckCircle2,
  Building2, CalendarDays, FolderArchive, CloudUpload,
  HardDriveUpload, Unlink, Link2, AlertTriangle, UploadCloud, Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Layout from '@/components/Layout';
import { MONTHS, YEARS, formatCurrency } from '@/lib/utils-app';
import { useAllFinancialRecords } from '@/hooks/useFinancial';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import { useContracts } from '@/hooks/useContracts';
import { useAuth } from '@/hooks/useAuth';
import { buildReceiptPDF } from '@/lib/generateReceiptPDF';
import { useGoogleDrive, DriveConfig } from '@/hooks/useGoogleDrive';
import { toast } from 'sonner';
import JSZip from 'jszip';

type Tab = 'download' | 'drive';
const DRIVE_CONFIG_KEY = 'livinggest_drive_config';

function loadDriveConfig(): DriveConfig | null {
  try { return JSON.parse(localStorage.getItem(DRIVE_CONFIG_KEY) ?? 'null'); } catch { return null; }
}

export default function Receipts() {
  const { user } = useAuth();
  const { data: financialRecords = [] } = useAllFinancialRecords();
  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [] } = useApartments();
  const { data: allTenants = [] } = useTenants();
  const { data: contracts = [] } = useContracts();
  const drive = useGoogleDrive();

  const now = new Date();
  const [tab, setTab] = useState<Tab>('download');
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth()));
  const [selectedCondo, setSelectedCondo] = useState<string>('all');
  const [downloading, setDownloading] = useState(false);
  const [driveConfig, setDriveConfig] = useState<DriveConfig | null>(loadDriveConfig);
  const [showConfig, setShowConfig] = useState(false);
  const [cfgInput, setCfgInput] = useState({ folderId: '', folderName: '' });
  const [driveUploading, setDriveUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const adminName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';
  const monthKey = `${selectedYear}-${String(Number(selectedMonth) + 1).padStart(2, '0')}`;
  const monthLabel = `${MONTHS[Number(selectedMonth)]} ${selectedYear}`;

  const matchingRecords = financialRecords.filter(r => {
    if (!r.paid || !r.payment_date?.startsWith(monthKey)) return false;
    if (selectedCondo !== 'all') {
      const apt = apartments.find(a => a.id === r.apartment_id);
      if (apt?.condominium_id !== selectedCondo) return false;
    }
    return true;
  });

  const enriched = matchingRecords.map(r => {
    const apt = apartments.find(a => a.id === r.apartment_id);
    return {
      ...r,
      apt,
      condo: condominiums.find(c => c.id === apt?.condominium_id),
      tenant: allTenants.find(t => t.id === r.tenant_id),
      contract: contracts.find(c => c.id === r.contract_id),
    };
  }).filter(r => r.apt && r.tenant);

  const byCondominium = enriched.reduce((acc, r) => {
    const k = r.condo?.name ?? 'Sem condomínio';
    (acc[k] ??= []).push(r);
    return acc;
  }, {} as Record<string, typeof enriched>);

  const byApartment = financialRecords.reduce((acc, r) => {
    (acc[r.apartment_id] ??= []).push(r);
    return acc;
  }, {} as Record<string, typeof financialRecords>);

  function buildFiles() {
    return enriched.map(r => {
      try {
        return {
          condoName: r.condo?.name ?? 'Sem_Condominio',
          aptUnit: r.apt!.unit_number,
          tenantName: `${r.tenant!.first_name}_${r.tenant!.last_name}`,
          month: r.payment_date?.substring(0, 7) ?? r.month, // mês do pagamento, não do período
          pdfBytes: buildReceiptPDF({
            record: r,
            apartmentUnit: r.apt!.unit_number,
            condominiumName: r.condo?.name ?? '',
            tenantFirstName: r.tenant!.first_name,
            tenantLastName: r.tenant!.last_name,
            tenantCpf: r.tenant!.cpf,
            contractPaymentDay: r.contract?.payment_day,
            contractStartDate: r.contract?.start_date,
            contractCautionPaid: r.contract?.caution_paid,
            contractCautionValue: r.contract?.caution_value,
            contractCautionDate: r.contract?.caution_date,
            allYearRecords: byApartment[r.apartment_id] ?? [],
            adminName,
          }),
          ok: true as const,
        };
      } catch {
        return { condoName: '', aptUnit: r.apt!.unit_number, tenantName: '', month: r.month, pdfBytes: new Uint8Array(), ok: false as const };
      }
    });
  }

  async function handleDownload() {
    if (!enriched.length) { toast.error('Nenhum recibo para baixar neste período.'); return; }
    setDownloading(true);
    try {
      const zip = new JSZip();
      let failed = 0;
      for (const f of buildFiles()) {
        if (!f.ok) { failed++; continue; }
        zip.file(`${f.condoName.replace(/[^a-zA-ZÀ-ú0-9 ]/g, '_')}/${`Recibo_${f.aptUnit}_${f.tenantName}.pdf`.replace(/\s+/g, '_')}`, f.pdfBytes);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `Recibos_${monthLabel.replace(' ', '_')}.zip`,
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      const ok = enriched.length - failed;
      failed > 0 ? toast.warning(`${ok} baixados, ${failed} falharam.`) : toast.success(`${ok} recibo${ok !== 1 ? 's' : ''} baixado${ok !== 1 ? 's' : ''}!`);
    } catch { toast.error('Erro ao gerar o arquivo ZIP.'); }
    finally { setDownloading(false); }
  }

  async function handleDriveUpload() {
    if (!driveConfig) { toast.error('Configure a pasta do Drive primeiro.'); return; }
    if (!enriched.length) { toast.error('Nenhum recibo para enviar neste período.'); return; }
    setDriveUploading(true);
    setProgress({ done: 0, total: enriched.length });
    try {
      const result = await drive.uploadReceipts(
        buildFiles().filter(f => f.ok),
        driveConfig,
        (done, total) => setProgress({ done, total }),
      );
      result.failed > 0
        ? toast.warning(`${result.uploaded} enviados, ${result.failed} falharam.`)
        : toast.success(`${result.uploaded} recibo${result.uploaded !== 1 ? 's' : ''} enviado${result.uploaded !== 1 ? 's' : ''} ao Drive!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setDriveUploading(false); setProgress(null); }
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

  // ── UI ─────────────────────────────────────────────────────────────────────
  const totalValue = enriched.reduce((s, r) => s + r.rent_value, 0);

  function Preview() {
    if (!enriched.length) return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Nenhum pagamento em {monthLabel}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Apenas pagamentos com data de pagamento neste mês são incluídos.</p>
      </div>
    );
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" />{enriched.length} recibo{enriched.length !== 1 ? 's' : ''} — {monthLabel}</span>
          <span className="text-sm font-bold" style={{ color: 'hsl(var(--paid))' }}>{formatCurrency(totalValue)}</span>
        </div>
        {Object.entries(byCondominium).map(([name, items]) => (
          <div key={name} className="rounded-lg bg-card border border-border/60 px-3 py-2">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{name}</span>
              <span className="text-xs text-muted-foreground">{items.length} recibo{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
              {items.map(r => (
                <div key={r.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: 'hsl(var(--paid))' }} />
                  <span className="truncate">{r.apt?.unit_number} — {r.tenant?.first_name} {r.tenant?.last_name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Layout>
      <div className="page-content">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <FolderArchive className="w-6 h-6 text-primary" /> Recibos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Baixe os recibos do período em ZIP ou envie direto ao Google Drive.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
          {([['download', Download, 'Download ZIP'], ['drive', CloudUpload, 'Backup Google Drive']] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setTab(id as Tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              ['Ano', CalendarDays, YEARS.map(y => ({ v: String(y), l: String(y) })), selectedYear, setSelectedYear],
              ['Mês', CalendarDays, MONTHS.map((m, i) => ({ v: String(i), l: m })), selectedMonth, setSelectedMonth],
            ] as const).map(([lbl, Icon, opts, val, set]) => (
              <div key={lbl} className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />{lbl}
                </Label>
                <Select value={val} onValueChange={set as any}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(opts as any[]).map((o: any) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />Condomínio
              </Label>
              <Select value={selectedCondo} onValueChange={setSelectedCondo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {condominiums.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Preview />

          {/* ── Download ZIP ── */}
          {tab === 'download' && (
            <Button className="w-full gap-2" size="lg" onClick={handleDownload} disabled={downloading || !enriched.length}>
              {downloading ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando ZIP...</> : <><Download className="w-4 h-4" />Baixar {enriched.length || ''} recibo{enriched.length !== 1 ? 's' : ''} — {monthLabel}</>}
            </Button>
          )}

          {/* ── Google Drive ── */}
          {tab === 'drive' && (
            <div className="space-y-4">
              {/* Status linha */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Pasta raiz */}
                <div className={`flex-1 flex items-center gap-3 rounded-xl px-4 py-3 border ${driveConfig ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/30'}`}>
                  <FolderArchive className={`w-5 h-5 shrink-0 ${driveConfig ? 'text-green-500' : 'text-muted-foreground'}`} />
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
                  <p className="text-xs text-amber-700 dark:text-amber-400">Configure a pasta raiz do Drive. Cole o link da pasta onde ficam os condomínios.</p>
                </div>
              )}

              {/* Preview estrutura */}
              {driveConfig && enriched.length > 0 && (
                <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-xs font-mono text-muted-foreground space-y-0.5">
                  <p className="font-semibold text-foreground text-xs mb-1">Estrutura que será criada no Drive:</p>
                  <p>📁 {driveConfig.rootFolderName}</p>
                  {Object.keys(byCondominium).map(name => (
                    <div key={name} className="ml-3 space-y-0.5">
                      <p>📁 {name}</p>
                      <p className="ml-4">📁 Recibos &rsaquo; {selectedYear} &rsaquo; {monthLabel}</p>
                      <p className="ml-8 text-muted-foreground/60">{byCondominium[name].length} arquivo{byCondominium[name].length !== 1 ? 's' : ''} PDF</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Progresso */}
              {progress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Enviando para o Drive...</span><span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              <Button className="w-full gap-2" size="lg" onClick={handleDriveUpload} disabled={driveUploading || !enriched.length || !driveConfig}>
                {driveUploading ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando ao Drive...</> : <><HardDriveUpload className="w-4 h-4" />Enviar {enriched.length || ''} recibo{enriched.length !== 1 ? 's' : ''} ao Drive — {monthLabel}</>}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal configuração */}
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
              <p className="text-xs text-muted-foreground mt-1">Cole o link da pasta que contém as subpastas de cada condomínio.</p>
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
              <p className="ml-8">📁 Recibos &rsaquo; 2026 &rsaquo; Março 2026</p>
              <p className="ml-12">Recibo_10-1_Joyce_Nayara.pdf</p>
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
