import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { sampleNotifications } from '../data/sampleData';
import { formatDate } from '../utils/format';

export default function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Reminders and updates about your invoices and payments."
      />
      <Card title="All notifications">
        <ul className="dashboard-list">
          {sampleNotifications.map((notification) => (
            <li key={notification.id} className="dashboard-list-item">
              <span
                className={`notification-dot${notification.severity === 'info' ? '' : ` is-${notification.severity}`}`}
                aria-hidden="true"
              />
              <div className="dashboard-list-main">
                <span className="dashboard-list-title">{notification.title}</span>
                <span className="dashboard-list-text">{notification.message}</span>
              </div>
              <span className="dashboard-list-meta">{formatDate(notification.date)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
