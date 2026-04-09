import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ChevronLeft, Home, Pencil, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, getRecordStatus, getPeriodAndDueDate } from '@/lib/utils-app';
import { useApp } from '@/lib/store';
import GlobalFilter from '@/components/GlobalFilter';
import Layout from '@/components/Layout';
import { useCondominiums } from '@/hooks/useCondominiums';
import {
  useApartments,
  useAddApartment,
  useUpdateApartment,
  useDeleteApartment,
  ApartmentDB,
} from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import { useAllFinancialRecords } from '@/hooks/useFinancial';
import { useContracts } from '@/hooks/useContracts';
 
function ApartmentModal({
  open,
  onClose,
  condominiumId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  condominiumId: string;
  initial?: ApartmentDB;
}) {
  const addApt = useAddApartment();
  const updateApt = useUpdateApartment();
  const [unitNumber, setUnitNumber] = useState(initial?.unit_number ?? '');
 
  async function handleSave() {
    if (!unitNumber) return;
    if (initial) {
      await updateApt.mutateAsync({ id: initial.id, unit_number: unitNumber });
    } else {
      await addApt.mutateAsync({ condominium_id: condominiumId, unit_number: unitNumber });
    }
    onClose();
  }
 
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Apartamento' : 'Novo Apartamento'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Número / Identificação *</Label>
            <Input
              className="mt-1"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
              placeholder="101"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={addApt.isPending || updateApt.isPending}
          >
            {initial ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
 
function ApartmentCard({
  apt,
  condominiumId,
  selectedYear,
  selectedMonth,
  allFinancialRecords,
}: {
  apt: ApartmentDB;
  condominiumId: string;
  selectedYear: number;
  selectedMonth: number | null;
  allFinancialRecords: {
    apartment_id: string;
    paid: boolean | null;
    rent_value: number;
    month: string;
    payment_date: string | null;
    status: string | null;
    contract_id?: string | null;
  }[];
}) {
  const navigate = useNavigate();
  const deleteApt = useDeleteApartment();
  const [editApt, setEditApt] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { data: tenants = [] } = useTenants(apt.id);
  const { data: contracts = [] } = useContracts();
  const currentTenant = tenants[0];
 
  // ✅ CORREÇÃO: receita usa payment_date; inadimplência usa month
  const received = allFinancialRecords
    .filter(r => {
      if (r.apartment_id !== apt.id || !r.paid || !r.payment_date) return false;
      const [y, m] = r.payment_date.split('-').map(Number);
      return y === selectedYear && (selectedMonth === null || m - 1 === selectedMonth);
    })
    .reduce((s, r) => s + r.rent_value, 0);
 
  // Status do card: 'overdue' | 'pending' | 'paid'
  const aptStatus = (() => {
    let hasOverdue = false;
    let hasPending = false;
    let hasPaid = false;

    for (const r of allFinancialRecords) {
      if (r.apartment_id !== apt.id) continue;
      const contract = contracts.find(c => c.id === r.contract_id);
      if (contract?.status === 'ended') continue;

      if (r.paid && r.payment_date) {
        const [y, m] = r.payment_date.split('-').map(Number);
        if (y === selectedYear && (selectedMonth === null || m - 1 === selectedMonth))
          hasPaid = true;
        continue;
      }

      // Nao pago — vencimento real (respeita desired_payment_day)
      const { dueDateStr } = getPeriodAndDueDate(
        r.month,
        contract?.start_date ?? null,
        contract?.payment_day ?? 1,
        contract?.desired_payment_day,
        contract?.desired_payment_date,
      );
      if (!dueDateStr || dueDateStr === '-') continue;
      const [y, m] = dueDateStr.split('-').map(Number);
      if (!(y === selectedYear && (selectedMonth === null || m - 1 === selectedMonth))) continue;

      const st = getRecordStatus(
        r.month,
        contract?.payment_day,
        contract?.start_date,
        contract?.desired_payment_day,
        contract?.desired_payment_date,
      );
      if (st === 'overdue') hasOverdue = true;
      else hasPending = true;
    }

    if (hasOverdue) return 'overdue';
    if (hasPending) return 'pending';
    if (hasPaid) return 'paid';
    return 'paid';
  })();

  const overdue = aptStatus === 'overdue';
  const pending = aptStatus === 'pending';

  return (
    <>
      <div
        className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-all cursor-pointer group"
        onClick={() => navigate(`/apartments/${apt.id}`)}
      >
        <div
          className={`h-1.5 w-full ${
            !currentTenant ? 'bg-muted' :
            overdue ? 'bg-destructive' :
            pending ? 'bg-muted-foreground' :
            'bg-green-500'
          }`}
        />
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold">Apto {apt.unit_number}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => {
                  e.stopPropagation();
                  setEditApt(true);
                }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setDeleteConfirm(true);
                }}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          {currentTenant ? (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-1">
                <User className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs font-medium truncate">
                  {currentTenant.first_name} {currentTenant.last_name}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className={
                  overdue ? 'badge-overdue' :
                  pending ? 'text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium' :
                  'badge-active'
                }>
                  {overdue ? 'Inadimplente' : pending ? 'A vencer' : 'Em dia'}
                </span>
                {received > 0 && (
                  <p
                    className="text-xs font-semibold"
                    style={{ color: 'hsl(var(--paid))' }}
                  >
                    {formatCurrency(received)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <span className="badge-unpaid">Vago</span>
            </div>
          )}
        </div>
      </div>
 
      <ApartmentModal
        open={editApt}
        onClose={() => setEditApt(false)}
        condominiumId={condominiumId}
        initial={apt}
      />
 
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Apartamento {apt.unit_number}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação excluirá o apartamento e todos os dados vinculados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteApt.mutateAsync(apt.id);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
 
export default function CondominiumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useApp();
  const [showAdd, setShowAdd] = useState(false);
 
  const { data: condominiums = [] } = useCondominiums();
  const { data: apartments = [], isLoading } = useApartments(id);
  const { data: allFinancialRecords = [] } = useAllFinancialRecords();
 
  const cond = condominiums.find(c => c.id === id);
  const { selectedYear, selectedMonth } = state;
 
  // ✅ CORREÇÃO: receita = registros PAGOS com payment_date no mês/ano selecionado
  const condApts = apartments.filter(a => a.condominium_id === id);
  const totalReceived = allFinancialRecords
    .filter(r => {
      if (!condApts.some(a => a.id === r.apartment_id)) return false;
      if (!r.paid || !r.payment_date) return false;
      const [y, m] = r.payment_date.split('-').map(Number);
      return (
        y === selectedYear && (selectedMonth === null || m - 1 === selectedMonth)
      );
    })
    .reduce((s, r) => s + r.rent_value, 0);
 
  if (!cond && !isLoading)
    return (
      <Layout>
        <div className="p-6">
          <p className="text-muted-foreground">Condomínio não encontrado.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate('/dashboard')}
          >
            Voltar
          </Button>
        </div>
      </Layout>
    );
 
  return (
    <Layout>
      <div className="page-content">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {cond?.name ?? 'Carregando...'}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">Gestão de apartamentos</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <GlobalFilter />
              <Button onClick={() => setShowAdd(true)} className="btn-primary-glow gap-1.5">
                <Plus className="w-4 h-4" />
                Novo Apartamento
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <div className="flex-1">
              <GlobalFilter />
            </div>
            <Button onClick={() => setShowAdd(true)} size="sm" className="shrink-0 gap-1">
              <Plus className="w-4 h-4" />
              Apto
            </Button>
          </div>
        </div>
 
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 stagger-children">
          <div className="stat-card stat-card-primary">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Total de Aptos</p>
            <p className="text-2xl font-bold relative z-10">{apartments.length}</p>
          </div>
          <div className="stat-card stat-card-paid">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Receita</p>
            <p
              className="text-lg md:text-2xl font-bold truncate relative z-10"
              style={{ color: 'hsl(var(--paid))' }}
            >
              {formatCurrency(totalReceived)}
            </p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 relative z-10">Ano</p>
            <p className="text-2xl font-bold relative z-10">{selectedYear}</p>
          </div>
        </div>
 
        {/* Apartments grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'hsl(var(--primary) / 0.3)', borderTopColor: 'hsl(var(--primary))' }}
            />
          </div>
        ) : apartments.length === 0 ? (
          <div className="empty-state">
            <Home className="empty-state-icon" />
            <p className="font-medium text-muted-foreground mb-1">Nenhum apartamento cadastrado</p>
            <p className="text-sm text-muted-foreground mb-4">Adicione o primeiro apartamento deste condomínio</p>
            <Button className="btn-primary-glow gap-1.5 mt-2" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4" /> Adicionar Apartamento
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {apartments.map(apt => (
              <ApartmentCard
                key={apt.id}
                apt={apt}
                condominiumId={id!}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                allFinancialRecords={allFinancialRecords}
              />
            ))}
          </div>
        )}
      </div>
 
      <ApartmentModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        condominiumId={id!}
      />
    </Layout>
  );
}
