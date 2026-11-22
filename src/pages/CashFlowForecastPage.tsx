import { TrendingUp } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

export default function CashFlowForecastPage() {
  return (
    <div>
      <PageHeader
        title="Cash Flow Forecast"
        description="See how upcoming invoices and expenses are expected to shape your cash position."
      />
      <EmptyState
        icon={TrendingUp}
        title="Coming in a later phase"
        description="Cash flow forecasting will be available in a future release."
      />
    </div>
  );
}
