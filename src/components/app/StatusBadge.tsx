import { AlertCircle, CheckCircle } from 'lucide-react';

export type RecordStatus = 'paid' | 'pending' | 'overdue';

/** Selo de status financeiro: Pago (verde), A Receber (âmbar), Inadimplente (vermelho). */
export function StatusBadge({ status }: { status: RecordStatus }) {
  if (status === 'paid')
    return (
      <span className="badge-paid">
        <CheckCircle className="w-3 h-3" />
        Pago
      </span>
    );
  if (status === 'overdue')
    return (
      <span className="badge-overdue">
        <AlertCircle className="w-3 h-3" />
        Inadimplente
      </span>
    );
  return <span className="badge-pending">A Receber</span>;
}
