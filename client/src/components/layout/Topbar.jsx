import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { notificationsApi } from '../../services/endpoints.js';
import { errorMessage } from '../../services/api.js';
import { StatusBadge } from '../ui/Display.jsx';
import { SEVERITY } from '../../utils/constants.js';
import { timeAgo } from '../../utils/format.js';
import { ChangePasswordModal } from './ChangePasswordModal.jsx';

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ unread: 0, critical: 0 });
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));

  const refreshCount = () => notificationsApi.unreadCount().then((r) => setCounts(r.data)).catch(() => {});

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60000);
    const onChange = () => refreshCount();
    window.addEventListener('notifications:changed', onChange);
    return () => {
      clearInterval(t);
      window.removeEventListener('notifications:changed', onChange);
    };
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const res = await notificationsApi.list({ limit: 6 }).catch(() => null);
      if (res) setItems(res.data);
    }
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.isRead) await notificationsApi.markRead(n._id).catch(() => {});
    refreshCount();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Notifications (${counts.unread} unread)`}>
        <Bell className="h-5 w-5" />
        {counts.unread > 0 && (
          <span className={`absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${counts.critical ? 'bg-red-600' : 'bg-amber-500'}`}>
            {counts.unread > 99 ? '99+' : counts.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <span className="text-xs text-slate-500">{counts.unread} unread</span>
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No notifications</li>}
            {items.map((n) => (
              <li key={n._id}>
                <button onClick={() => openItem(n)} className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${n.isRead ? '' : 'bg-brand-50/40'}`}>
                  <div className="flex items-center gap-2">
                    {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                    <p className="flex-1 truncate text-sm font-medium text-slate-800">{n.title}</p>
                    <StatusBadge map={SEVERITY} value={n.severity} />
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50">
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const initials = user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const signOut = async () => {
    try {
      await logout();
      toast.info('You have been signed out');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm leading-tight font-medium text-slate-800">{user?.name}</span>
          <span className="block text-xs leading-tight text-slate-500">{ROLE_LABELS[user?.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium text-slate-800">{user?.email}</p>
            <p className="text-xs text-slate-500">{user?.department || ROLE_LABELS[user?.role]}</p>
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); setPwOpen(true); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <KeyRound className="h-4 w-4" /> Change password
          </button>
          <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

export function Topbar({ onMenu, menuIcon: MenuIcon }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-500">
          <span className="font-medium text-slate-800">{user?.hotel?.name}</span>
          <span className="hidden sm:inline"> · {user?.hotel?.code}</span>
        </p>
      </div>
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
