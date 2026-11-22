import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type StatAccent = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  /** Trend text, e.g. "+12% vs last month" */
  trend?: string;
  /** true = positive (green), false = negative (red), undefined = neutral */
  trendPositive?: boolean;
  accent?: StatAccent;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendPositive,
  accent = 'primary',
}: StatCardProps) {
  const trendClass =
    trendPositive === undefined ? '' : trendPositive ? 'is-up' : 'is-down';

  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon is-${accent}`}>
          <Icon size={18} />
        </span>
      </div>
      <span className="stat-value">{value}</span>
      {trend && <span className={`stat-trend ${trendClass}`}>{trend}</span>}
    </div>
  );
}
