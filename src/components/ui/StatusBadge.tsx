import type { SampleCustomerStatus, SampleInvoiceStatus } from '../../types/sample';

type Status = SampleCustomerStatus | SampleInvoiceStatus;

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral';

const statusVariant: Record<Status, BadgeVariant> = {
  Paid: 'success',
  Pending: 'warning',
  'Partially Paid': 'warning',
  Overdue: 'danger',
  Unpaid: 'danger',
  Draft: 'neutral',
};

interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge badge-${statusVariant[status]}`}>{status}</span>;
}
