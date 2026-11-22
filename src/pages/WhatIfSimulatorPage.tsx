import { SlidersHorizontal } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

export default function WhatIfSimulatorPage() {
  return (
    <div>
      <PageHeader
        title="What-If Simulator"
        description="Explore how changes to pricing, clients or costs could affect your finances."
      />
      <EmptyState
        icon={SlidersHorizontal}
        title="Coming in a later phase"
        description="Scenario simulation will be available in a future release."
      />
    </div>
  );
}
