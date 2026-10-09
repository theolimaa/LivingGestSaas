import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Wallet, FileText, FileBarChart2, DoorOpen, CheckCircle2, MessageCircle } from 'lucide-react';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCondominiums } from '@/hooks/useCondominiums';
import { useApartments } from '@/hooks/useApartments';
import { useTenants } from '@/hooks/useTenants';
import { useAllFinancialRecords, calcReceived } from '@/hooks/useFinancial';
import { useOverdueSummary } from '@/hooks/useOverdueSummary';
import { formatCurrency } from '@/lib/utils-app';
import { whatsappLink } from '@/lib/whatsapp';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const OVERDUE_PREVIEW_COUNT = 4;

export default function Home() {
  const navigate = useNavigate();
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const { user } = useAuth();
  const { data: condominiums = [], isLoading: l1 } = useCondominiums();
  const { data: apartments = [], isLoading: l2 } = useApartments();
  const { data: allTenants = [], isLoading: l3 } = useTenants();
  const { data: financialRecords = [], isLoading: l4 } = useAllFinancialRecords();
  const { items: overdueItems, totalCount: overdueCount, totalValue: overdueValue, isLoading: l5 } = useOverdueSummary();
  const loading = l1 || l2 || l3 || l4 || l5;

  const userName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Administrador';

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const recebidoMes = financialRecords
    .filter(r => r.paid && r.payment_date?.startsWith(monthKey))
    .reduce((s, r) => s + calcReceived(r), 0);

  const occupiedCount = apartments.filter(a => allTenants.some(t => t.apartment_id === a.id)).length;
  const vacantCount = apartments.length - occupiedCount;
  const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const actions = [
    { label: 'Registrar pagamento', sub: 'Financeiro, só os em atraso', icon: Wallet, path: '/financeiro?status=overdue', primary: true },
    { label: 'Gerar recibos', sub: 'Em lote, por condomínio', icon: FileText, path: '/recibos' },
    { label: 'Relatório mensal', sub: 'PDF por condomínio', icon: FileBarChart2, path: '/financeiro/relatorio' },
    {
      label: 'Vacância',
      sub: loading ? 'Calculando…' : `${vacantCount} unidade${vacantCount !== 1 ? 's' : ''} vaga${vacantCount !== 1 ? 's' : ''}`,
      icon: DoorOpen,
      path: '/financeiro/vacancia',
    },
  ];

  return (
    <Layout>
      <div className="page-content">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {userName}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 capitalize">{dateLabel}</p>
        </div>

        {/* Indicadores */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Recebido esse mês</p>
            {loading ? (
              <Skeleton className="h-7 w-32" />
            ) : (
              <p className="text-xl font-extrabold text-paid">{formatCurrency(recebidoMes)}</p>
            )}
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-1">Ocupação</p>
            {loading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <p className="text-xl font-extrabold">
                {occupiedCount}
                <span className="text-sm font-medium text-muted-foreground"> / {apartments.length} unidades</span>
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/financeiro?status=overdue')}
            className={`text-left rounded-xl border p-4 transition-colors ${
              !loading && overdueCount > 0
                ? 'bg-overdue/5 border-overdue/25 hover:border-overdue/50'
                : 'bg-card border-border hover:border-primary/40'
            }`}
          >
            <p className="text-xs text-muted-foreground mb-1">Inadimplência</p>
            {loading ? (
              <Skeleton className="h-7 w-40" />
            ) : (
              <p className={`text-xl font-extrabold ${overdueCount > 0 ? 'text-overdue' : 'text-paid'}`}>
                {overdueCount}
                <span className="text-sm font-medium text-muted-foreground">
                  {' '}
                  inquilino{overdueCount !== 1 ? 's' : ''}
                  {overdueCount > 0 ? ` · ${formatCurrency(overdueValue)}` : ''}
                </span>
              </p>
            )}
          </button>
        </div>

        {/* Precisa cobrar */}
        {loading ? (
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            {[0, 1, 2].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : overdueItems.length > 0 ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-bold">Precisa cobrar</p>
              <button onClick={() => navigate('/financeiro?status=overdue')} className="text-xs text-primary font-semibold hover:underline py-1">
                Ver tudo no Financeiro
              </button>
            </div>
            <ul className="divide-y divide-border">
              {(showAllOverdue ? overdueItems : overdueItems.slice(0, OVERDUE_PREVIEW_COUNT)).map(item => {
                const wa = whatsappLink(
                  item.tenantPhone,
                  `Olá ${item.tenantName.split(' ')[0]}, tudo bem? Passando para lembrar do aluguel do apto ${item.aptUnit} (${item.condominiumName}), em aberto no valor de ${formatCurrency(item.totalOverdue)}. Qualquer dúvida, é só falar!`,
                );
                return (
                  <li key={item.apartmentId} className="flex items-center gap-2 pr-3 hover:bg-muted/40 transition-colors">
                    <button
                      onClick={() => navigate(`/apartments/${item.apartmentId}?tab=financial`)}
                      className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left"
                    >
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-overdue/10 text-overdue">
                        {item.tenantName.charAt(0)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">{item.tenantName}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {item.condominiumName} · {item.aptUnit} · {item.daysOverdue} dias em atraso
                        </span>
                      </span>
                      <span className="text-sm font-bold shrink-0 text-overdue">{formatCurrency(item.totalOverdue)}</span>
                    </button>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Cobrar ${item.tenantName} no WhatsApp`}
                        title="Cobrar no WhatsApp"
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-paid hover:bg-paid/10 transition-colors"
                      >
                        <MessageCircle className="w-5 h-5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
            {overdueItems.length > OVERDUE_PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllOverdue(v => !v)}
                className="w-full px-4 py-3 border-t border-border text-xs font-semibold text-primary hover:bg-muted/50 transition-colors"
              >
                {showAllOverdue ? 'Ver menos' : `Ver mais (${overdueItems.length - OVERDUE_PREVIEW_COUNT})`}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-paid shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">Tudo em dia.</span>{' '}
              <span className="text-muted-foreground">Nenhum inquilino com aluguel atrasado.</span>
            </p>
          </div>
        )}

        {/* Ações rápidas (o resto está no menu) */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ações rápidas</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {actions.map(a => (
              <button
                key={a.path}
                onClick={() => navigate(a.path)}
                className="bg-card rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 bg-primary/10 text-primary">
                  <a.icon className="w-[18px] h-[18px]" />
                </div>
                <p className="text-sm font-bold leading-tight">{a.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.sub}</p>
              </button>
            ))}
          </div>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              {condominiums.length} condomínio{condominiums.length !== 1 ? 's' : ''} · {apartments.length} unidades
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
