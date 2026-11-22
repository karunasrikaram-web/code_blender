import {
  Bell,
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navigationItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Customers', path: '/customers', icon: Users },
  { label: 'Invoices', path: '/invoices', icon: FileText },
  { label: 'Payments', path: '/payments', icon: CreditCard },
  { label: 'Expenses', path: '/expenses', icon: Receipt },
  { label: 'Cash Flow Forecast', path: '/forecast', icon: TrendingUp },
  { label: 'What-If Simulator', path: '/what-if', icon: SlidersHorizontal },
  { label: 'AI Assistant', path: '/ai-assistant', icon: Sparkles },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Settings', path: '/settings', icon: Settings },
  { label: 'Features', path: '/features', icon: Sparkles },
];

