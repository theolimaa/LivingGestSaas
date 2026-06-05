import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils-app';
import Layout from '@/components/Layout';
import { useApartment, useApartments } from '@/hooks/useApartments';
import { useTenants, useAddTenant, usePreviousTenants } from '@/hooks/useTenants';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useAuth } from '@/hooks/useAuth';
import TenantTabDB from '@/components/apartment/TenantTabDB';
import DocumentsTabDB from '@/components/apartment/DocumentsTabDB';
import ContractTabDB from '@/components/apartment/ContractTabDB';
import FinancialTabDB from '@/components/apartment/FinancialTabDB';
import PreviousTenantsTab from '@/components/apartment/PreviousTenantsTab';

function AddTenantModal({
  open,
  onClose,
  apartmentId,
}: {
  open: boolean;
  onClose: () => void;
  apartmentId: string;
}) {
  const addTenant = useAddTenant();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    cpf: '',
    phone: '',
    email: '',
  });

  async function handleSave() {
    if (!form.first_name) return;
    await addTenant.mutateAsync({
      apartment_id: apartmentId,
      first_name: form.first_name,
      last_name: form.last_name,
      cpf: form.cpf || null,
      phone: form.phone || null,
      email: form.email || null,
      birth_date: null,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Inquilino</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome *</Label>
              <Input
                className="mt-1"
                value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })}
                placeholder="Nome"
              />
            </div>
            <div>
              <Label>Sobrenome</Label>
              <Input
                className="mt-1"
                value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })}
                placeholder="Sobrenome"
              />
            </div>
          </div>
          <div>
            <Label>CPF</Label>
            <Input
              className="mt-1"
              value={form.cpf}
              onChange={e => setForm({ ...form, cpf: e.target.value })}
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <Label>Celular</Label>
            <Input
              className="mt-1"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="(85) 99999-9999"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={addTenant.isPending}>
            {addTenant.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Adicionar Inquilino
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [activeTab, setActiveTab] = useState('tenant');

  const { data: apartment, isLoading: loadingApt } = useApartment(id!);
  const { data: tenants = [], isLoading: loadingTenants } = useTenants(id);
  const { data: condominiums = [] } = useCondominiums();
  const { data: previousTenants = [] } = usePreviousTenants(id!);

  // Busca todos os aptos do mesmo condomínio para navegação prev/next
  const { data: condoApartments = [] } = useApartments(apartment?.condominium_id);

  const currentTenant = tenants[0];
  const cond = condominiums.find(c => c.id === apartment?.condominium_id);
  const { user } = useAuth();
  const adminName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';

  // Ordenação natural dos apartamentos (mesmo critério da listagem)
  const sortedApts = [...condoApartments].sort((a, b) =>
    a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
  );
  const currentIndex = sortedApts.findIndex(a => a.id === id);
  const prevApt = currentIndex > 0 ? sortedApts[currentIndex - 1] : null;
  const nextApt = currentIndex < sortedApts.length - 1 ? sortedApts[currentIndex + 1] : null;

  if (loadingApt || loadingTenants) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!apartment) {
    return (
      <Layout>
        <div className="p-4 md:p-6">
          <p className="text-muted-foreground">Apartamento não encontrado.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/condominiums/${apartment.condominium_id}`)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-2xl font-bold">Apto {apartment.unit_number}</h1>
                {currentTenant ? (
                  <span className="badge-active flex items-center gap-1">
                    <UserCheck className="w-3 h-3" /> Ocupado
                  </span>
                ) : (
                  <span className="badge-unpaid flex items-center gap-1">
                    <UserX className="w-3 h-3" /> Vago
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{cond?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Navegação prev/next */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevApt && navigate(`/apartments/${prevApt.id}`)}
                disabled={!prevApt}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={prevApt ? `Apto ${prevApt.unit_number}` : 'Primeiro apartamento'}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs text-muted-foreground px-1 hidden sm:block">
                {currentIndex + 1}/{sortedApts.length}
              </span>
              <button
                onClick={() => nextApt && navigate(`/apartments/${nextApt.id}`)}
                disabled={!nextApt}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={nextApt ? `Apto ${nextApt.unit_number}` : 'Último apartamento'}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {!currentTenant && (
              <Button onClick={() => setShowAddTenant(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Inquilino
              </Button>
            )}
          </div>
        </div>

        {/* Main content */}
        {currentTenant ? (
          <div className="bg-card rounded-xl border border-border">
            <div className="flex items-center gap-4 p-4 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">
                  {currentTenant.first_name.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-semibold">
                  {currentTenant.first_name} {currentTenant.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Desde {formatDate(currentTenant.created_at)}
                </p>
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
              <TabsList className="mb-4">
                <TabsTrigger value="tenant">Inquilino</TabsTrigger>
                <TabsTrigger value="documents">
                  <span className="hidden sm:inline">Documentos</span>
                  <span className="sm:hidden">Docs</span>
                </TabsTrigger>
                <TabsTrigger value="contract">Contrato</TabsTrigger>
                <TabsTrigger value="financial">
                  <span className="hidden sm:inline">Financeiro</span>
                  <span className="sm:hidden">Fin.</span>
                </TabsTrigger>
                <TabsTrigger value="previous">
                  <span className="hidden sm:inline">Anteriores</span>
                  <span className="sm:hidden">Ant.</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tenant">
                <TenantTabDB tenant={currentTenant} apartmentId={apartment.id} />
              </TabsContent>
              <TabsContent value="documents">
                <DocumentsTabDB tenantId={currentTenant.id} />
              </TabsContent>
              <TabsContent value="contract">
                <ContractTabDB
                  tenantId={currentTenant.id}
                  apartmentId={apartment.id}
                  tenantName={`${currentTenant.first_name} ${currentTenant.last_name}`}
                  tenantCpf={currentTenant.cpf}
                  condominiumName={cond?.name ?? ''}
                  apartmentUnit={apartment.unit_number}
                  adminName={adminName}
                />
              </TabsContent>
              <TabsContent value="financial">
                <FinancialTabDB
                  apartmentId={apartment.id}
                  tenantId={currentTenant.id}
                  tenantName={`${currentTenant.first_name} ${currentTenant.last_name}`}
                  tenantCpf={currentTenant.cpf ?? ''}
                />
              </TabsContent>
              <TabsContent value="previous">
                <PreviousTenantsTab
                  previousTenants={previousTenants}
                  apartmentId={apartment.id}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
              <TabsList className="mb-4">
                <TabsTrigger value="tenant" disabled>
                  Inquilino
                </TabsTrigger>
                <TabsTrigger value="previous">
                  <span className="hidden sm:inline">Anteriores</span>
                  <span className="sm:hidden">Ant.</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tenant">
                <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center">
                  <UserX className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium mb-1">Apartamento vago</p>
                  <p className="text-muted-foreground text-sm mb-4">
                    Nenhum inquilino ativo no momento
                  </p>
                  <Button onClick={() => setShowAddTenant(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Inquilino
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="previous">
                <PreviousTenantsTab
                  previousTenants={previousTenants}
                  apartmentId={apartment.id}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <AddTenantModal
        open={showAddTenant}
        onClose={() => setShowAddTenant(false)}
        apartmentId={apartment.id}
      />
    </Layout>
  );
}
