import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { formatCurrency } from '@/lib/utils-app';
import { useOverdueSummary } from '@/hooks/useOverdueSummary';
import { useOverdueAgreements } from '@/hooks/useOverdueAgreements';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rent = useOverdueSummary();
  const agr = useOverdueAgreements();
  const items = rent.items;
  const agreementItems = agr.items;
  const totalCount = rent.totalCount + agr.totalCount;
  const totalValue = rent.totalValue + agr.totalValue;
  const isLoading = rent.isLoading || agr.isLoading;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  function goToApartment(apartmentId: string) {
    setOpen(false);
    navigate(`/apartments/${apartmentId}?tab=financial`);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Inadimplência"
        className="relative w-9 h-9 rounded-lg border flex items-center justify-center transition-colors hover:border-primary/50"
        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--secondary))', color: 'hsl(var(--foreground))' }}
      >
        <Bell className="w-4 h-4" />
        {totalCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[17px] h-[17px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
            style={{ background: 'hsl(var(--overdue))', border: '2px solid hsl(var(--card))' }}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border z-50 overflow-hidden"
          style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', boxShadow: '0 16px 40px -14px rgb(0 0 0 / 0.25)' }}
        >
          <div className="flex items-baseline justify-between px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-sm font-bold">Inadimplentes</h3>
            {totalCount > 0 && (
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--overdue))' }}>
                {formatCurrency(totalValue)}
              </span>
            )}
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Carregando…</p>
          ) : totalCount === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum inadimplente no momento.</p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto p-1.5">
              {agreementItems.length > 0 && (
                <li className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Acordos de dívida
                </li>
              )}
              {agreementItems.map(item => (
                <li key={`ag-${item.previousTenantId}`}>
                  <button
                    onClick={() => { setOpen(false); navigate('/anteriores'); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ background: 'hsl(var(--overdue) / 0.12)', color: 'hsl(var(--overdue))' }}
                    >
                      {item.tenantName.charAt(0)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{item.tenantName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="truncate">{item.condominiumName} · {item.aptUnit}</span>
                        <span
                          className="shrink-0 text-[10px] font-bold rounded-full px-1.5"
                          style={{ background: 'hsl(var(--overdue) / 0.12)', color: 'hsl(var(--overdue))' }}
                        >
                          {item.daysOverdue}d
                        </span>
                        {item.overdueCount > 1 && (
                          <span className="shrink-0 text-[10px]">{item.overdueCount} parcelas</span>
                        )}
                      </p>
                    </span>
                    <span className="text-xs font-bold shrink-0">{formatCurrency(item.totalOverdue)}</span>
                  </button>
                </li>
              ))}
              {agreementItems.length > 0 && items.length > 0 && (
                <li className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Aluguéis
                </li>
              )}
              {items.map(item => (
                <li key={item.apartmentId}>
                  <button
                    onClick={() => goToApartment(item.apartmentId)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ background: 'hsl(var(--overdue) / 0.12)', color: 'hsl(var(--overdue))' }}
                    >
                      {item.tenantName.charAt(0)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{item.tenantName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="truncate">{item.condominiumName} · {item.aptUnit}</span>
                        <span
                          className="shrink-0 text-[10px] font-bold rounded-full px-1.5"
                          style={{ background: 'hsl(var(--overdue) / 0.12)', color: 'hsl(var(--overdue))' }}
                        >
                          {item.daysOverdue}d
                        </span>
                      </p>
                    </span>
                    <span className="text-xs font-bold shrink-0">{formatCurrency(item.totalOverdue)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totalCount > 0 && (
            <div className="px-3.5 py-2.5 border-t text-center text-[11px] text-muted-foreground" style={{ borderColor: 'hsl(var(--border))' }}>
              Clique num nome pra registrar o pagamento
            </div>
          )}
        </div>
      )}
    </div>
  );
}
