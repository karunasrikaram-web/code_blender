import { Sparkles } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';

export default function AiAssistantPage() {
  return (
    <div>
      <PageHeader
        title="AI Assistant"
        description="Ask questions about your finances and get suggested next steps."
      />
      <EmptyState
        icon={Sparkles}
        title="Coming in a later phase"
        description="The AI assistant will be available in a future release."
      />
    </div>
  );
}
