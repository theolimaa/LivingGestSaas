import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'paid' | 'warning' | 'overdue' | 'primary' | 'neutral';

const TONE: Record<Tone, { value: string; badge: string; line: string }> = {
  paid: { value: 'text-paid', badge: 'icon-badge-success', line: 'stat-card-paid' },
  warning: { value: 'text-warning', badge: 'icon-badge-warning', line: 'stat-card-warning' },
  overdue: { value: 'text-overdue', badge: 'icon-badge-danger', line: 'stat-card-danger' },
  primary: { value: 'text-primary', badge: 'icon-badge-primary', line: 'stat-card-primary' },
  neutral: { value: 'text-foreground', badge: 'icon-badge-primary', line: '' },
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
}

/** Card de indicador padrão: rótulo, valor em destaque e dica. */
export function KpiCard({ label, value, hint, icon: Icon, tone = 'neutral', className }: KpiCardProps) {
  const t = TONE[tone];
  return (
    <div className={cn('stat-card', t.line, className)}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        {Icon && (
          <div className={cn('icon-badge', t.badge)}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className={cn("text-xl md:text-2xl font-bold", t.value)}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1.5 space-y-1">{hint}</div>}
    </div>
  );
}
