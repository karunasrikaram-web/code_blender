import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your business profile and preferences."
      />
      <Card
        title="Business profile"
        actions={<span className="badge badge-info">Coming in a later phase</span>}
      >
        <dl className="customer-details">
          <div>
            <dt>Name</dt>
            <dd>Alex Morgan</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>Freelance Web Designer</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>alex@morganwebstudio.com</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
