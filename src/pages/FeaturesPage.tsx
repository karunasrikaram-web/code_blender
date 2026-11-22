import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Target,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import '../styles/features.css';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  how: string;
  why: [string, string] | [string, string, string];
  example: string;
  note?: string;
}

const FEATURES: Feature[] = [
  {
    icon: LayoutDashboard,
    title: 'Smart Dashboard',
    description: 'See your financial position at a glance.',
    how: 'Shows total revenue received, outstanding payments, overdue invoices, expenses and the current cash position, with charts and recent transactions.',
    why: ['Spot problems in seconds', 'No spreadsheets to update'],
    example: 'Open the dashboard on Monday to see what was received last week and what is still unpaid.',
  },
  {
    icon: Users,
    title: 'Customer Management',
    description: 'Keep every client in one place.',
    how: "Add, edit, view and delete customers. Store names, contact details and project information, and see each customer's invoices and payments.",
    why: ['Find client details quickly', 'Follow up with the right person'],
    example: 'Before sending a reminder, open a customer to check the invoice and payment history.',
  },
  {
    icon: FileText,
    title: 'Invoice Management',
    description: 'Create professional invoices and track their status.',
    how: 'Create invoices with automatic invoice numbers, download them as PDF, and see whether each is pending, partially paid, paid or overdue.',
    why: ['Look professional', 'Know which invoices are late'],
    example: 'Send an invoice as a PDF, then check its status when the due date passes.',
  },
  {
    icon: CreditCard,
    title: 'Payment Tracking',
    description: 'Record full and partial payments.',
    how: 'Record each payment against its invoice. The remaining balance is calculated automatically, and payment history is kept.',
    why: ['Know what has really been received', 'Avoid counting a partial payment twice'],
    example: 'A ₹10,000 invoice with ₹4,000 received shows ₹6,000 still due.',
  },
  {
    icon: Receipt,
    title: 'Expense Management',
    description: 'Track where your money goes.',
    how: 'Record expenses with an amount, date, category and optional due date. Totals and history are shown together.',
    why: ['See spending by category', 'Plan for upcoming bills'],
    example: 'Log a ₹1,500 hosting renewal due next month so it appears in your forecast.',
  },
  {
    icon: TrendingUp,
    title: 'Cash Flow Forecast',
    description: 'Estimate your cash position for the next 30, 60 or 90 days.',
    how: 'Starts from recorded cash, adds outstanding invoices on their due dates, subtracts pending expenses on their due dates, and highlights any day the balance may go negative. This is a rule-based calculation from your records, not a machine-learning prediction.',
    why: ['Spot shortages early', 'Separate confirmed cash from estimated cash'],
    example: 'If the forecast shows a negative balance on the 25th, you can chase payments or move a bill before then.',
  },
  {
    icon: Target,
    title: 'What-If Simulator',
    description: 'Test how delays and surprises would change your cash.',
    how: 'Delay unpaid invoices by 5, 10, 15 or 30 days, or add an unexpected expense, and compare the original and simulated forecasts side by side. Simulations are temporary and never change your records.',
    why: ['Plan before problems happen', 'Test without risk'],
    example: 'See what next month\'s balance looks like if your largest client pays 15 days late.',
  },
  {
    icon: Bot,
    title: 'AI Financial Assistant',
    description: 'Ask questions about your own finances.',
    how: 'Ask in plain language, for example who owes you money or which invoices are overdue. Answers are built from your recorded invoices, payments and expenses. It can draft a polite payment reminder for you to review and send yourself. Nothing is sent automatically, and it does not change any records.',
    why: ['Quick answers without digging through pages', 'Reminder drafts save time'],
    example: "Ask 'Which invoices are overdue?' and get a list with amounts.",
    note: 'Requires the assistant to be configured on the server.',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'In-app alerts for overdue invoices, upcoming payments, expenses and low cash.',
    how: 'The Notifications page lists alerts generated from your records, each with a suggested next step. Alerts appear inside the app only. Email, WhatsApp and push delivery are not set up.',
    why: ['Act on problems the same day', 'Clear next steps'],
    example: 'An invoice 5 days overdue shows an alert suggesting a payment reminder.',
    note: 'Notification preferences can be saved in Settings, but they do not yet filter these alerts.',
  },
  {
    icon: Settings,
    title: 'Settings and Personalization',
    description: 'Make the app match your business.',
    how: 'Update your profile and business details, set invoice numbering, payment terms and notes, choose a currency (INR ₹) and financial thresholds, and pick a light, dark or system theme. Export customers, invoices, payments and expenses as CSV from Data management.',
    why: ['Invoices reflect your business', 'Control how the app works'],
    example: 'Set your invoice prefix and payment terms once, rather than typing them each time.',
    note: 'Dark mode colours are still being refined.',
  },
];

const COMING_LATER: string[] = [
  'Account deletion (needs a secure server step)',
  'Email and WhatsApp reminders',
  'Applying invoice settings to every generated PDF',
];

export default function FeaturesPage() {
  const [expanded, setExpanded] = useState<boolean[]>(() =>
    FEATURES.map(() => false),
  );

  const toggle = (index: number) => {
    setExpanded((prev) => prev.map((open, i) => (i === index ? !open : open)));
  };

  return (
    <div className="features-page">
      <header className="features-header">
        <div>
          <h1>Everything You Need to Manage Your Cash Flow</h1>
          <p className="features-subtitle">
            Smart Cash Flow Manager helps freelance website designers and small
            businesses track what they are owed, what they spend, and what cash
            they will have in the coming weeks.
          </p>
          <p className="features-note">
            Cash figures come from the records you enter. Forecasts are
            calculated estimates, not guaranteed financial advice.
          </p>
        </div>
        <Link to="/login" className="features-get-started">
          Get Started
        </Link>
      </header>

      <div className="features-grid">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          const isOpen = expanded[index];
          const detailsId = `feature-details-${index}`;
          return (
            <article key={feature.title} className="features-card">
              <div className="features-card-icon">
                <Icon size={24} aria-hidden="true" />
              </div>
              <h2>{feature.title}</h2>
              <p className="features-card-description">{feature.description}</p>

              <button
                type="button"
                className="features-toggle"
                aria-expanded={isOpen}
                aria-controls={detailsId}
                onClick={() => toggle(index)}
              >
                {isOpen ? 'Hide details' : 'Show details'}
              </button>

              {isOpen && (
                <div id={detailsId} className="features-details">
                  <h3>How it works</h3>
                  <p>{feature.how}</p>
                  <h3>Why it helps</h3>
                  <ul>
                    {feature.why.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <p className="features-example">
                    <strong>Example:</strong> {feature.example}
                  </p>
                  {feature.note && (
                    <p className="features-status-note">{feature.note}</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="features-coming-later" aria-labelledby="coming-later-title">
        <h2 id="coming-later-title">Coming later</h2>
        <p>These are planned, not working yet:</p>
        <ul>
          {COMING_LATER.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
