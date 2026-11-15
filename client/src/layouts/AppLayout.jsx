import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Bell, Boxes, ClipboardList, Gauge, Hotel, LayoutDashboard, Menu, ScrollText,
  Settings, ShoppingCart, Tags, Truck, Users, X, ArrowLeftRight,
} from 'lucide-react';
import { useAuth, ROLES } from '../context/AuthContext.jsx';
import { Topbar } from '../components/layout/Topbar.jsx';

const NAV = [
  { section: 'Operations', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/inventory', label: 'Inventory', icon: Boxes },
    { to: '/movements', label: 'Stock Movements', icon: ArrowLeftRight },
    { to: '/notifications', label: 'Alerts', icon: Bell },
  ] },
  { section: 'Optimization & Purchasing', roles: [ROLES.ADMIN, ROLES.MANAGER], items: [
    { to: '/optimization', label: 'Optimization', icon: Gauge },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
    { to: '/suppliers', label: 'Suppliers', icon: Truck },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/categories', label: 'Categories', icon: Tags },
  ] },
  { section: 'Administration', roles: [ROLES.ADMIN], items: [
    { to: '/users', label: 'Users', icon: Users },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/audit-logs', label: 'Audit Log', icon: ScrollText },
  ] },
];

function Sidebar({ onNavigate }) {
  const { user, hasRole } = useAuth();
  return (
    <div className="flex h-full flex-col bg-brand-950 text-brand-100">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <Hotel className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user?.hotel?.name || 'Hotel'}</p>
          <p className="text-xs text-brand-300">Inventory Optimization</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" aria-label="Main">
        {NAV.filter((s) => !s.roles || hasRole(...s.roles)).map((section) => (
          <div key={section.section}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-brand-400 uppercase">{section.section}</p>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/10 text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-brand-400">
        <ClipboardList className="mr-1 inline h-3 w-3" /> v1.0 · Need Technosoft internship project
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw]">
            <button className="absolute top-4 right-3 z-10 rounded p-1 text-brand-200 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} menuIcon={Menu} />
        <main key={location.pathname} className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
