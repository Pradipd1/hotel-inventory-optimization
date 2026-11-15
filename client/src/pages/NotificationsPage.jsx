import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Bell, CheckCheck, Info, MailOpen, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { notificationsApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Badge, Card, DataState, PageHeader, StatusBadge, Tabs } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Form.jsx';
import { Pagination } from '../components/ui/Table.jsx';
import { SEVERITY } from '../utils/constants.js';
import { formatDateTime, timeAgo, titleCase } from '../utils/format.js';

const ICONS = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const ICON_CLS = { critical: 'bg-red-50 text-red-600', warning: 'bg-amber-50 text-amber-600', info: 'bg-blue-50 text-blue-600' };

export default function NotificationsPage() {
  const { isManagement } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ state: 'active', unread: '', severity: '', page: 1 });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const { data, loading, error, reload } = useApi(() => notificationsApi.list({ ...filters, limit: 20 }), [JSON.stringify(filters)]);
  const [scanning, setScanning] = useState(false);

  const changed = () => {
    window.dispatchEvent(new Event('notifications:changed'));
    reload();
  };

  const toggleRead = async (n) => {
    try {
      await (n.isRead ? notificationsApi.markUnread(n._id) : notificationsApi.markRead(n._id));
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const markAll = async () => {
    try {
      const res = await notificationsApi.markAllRead();
      toast.success(res.message);
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const res = await notificationsApi.scan();
      toast.success(`${res.message}. Alerts are up to date.`);
      changed();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const open = async (n) => {
    if (!n.isRead) await notificationsApi.markRead(n._id).catch(() => {});
    window.dispatchEvent(new Event('notifications:changed'));
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <PageHeader
        title="Alert center"
        description="Low stock, expiry, overstock, approvals and significant adjustments. Condition alerts resolve automatically when the condition clears."
        actions={
          <>
            {isManagement && <Button variant="secondary" icon={RefreshCw} loading={scanning} onClick={scan}>Re-scan inventory</Button>}
            <Button variant="secondary" icon={CheckCheck} onClick={markAll}>Mark all as read</Button>
          </>
        }
      />
      <Tabs
        value={filters.state}
        onChange={(state) => set({ state })}
        tabs={[
          { value: 'active', label: 'Active alerts' },
          { value: 'all', label: 'All notifications' },
          { value: 'resolved', label: 'Resolved' },
        ]}
      />
      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <Select value={filters.severity} onChange={(e) => set({ severity: e.target.value })} className="sm:w-44" aria-label="Severity">
            <option value="">All severities</option>
            {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={filters.unread} onChange={(e) => set({ unread: e.target.value })} className="sm:w-44" aria-label="Read status">
            <option value="">Read & unread</option>
            <option value="true">Unread only</option>
          </Select>
          {data?.meta && <span className="text-sm text-slate-500 sm:ml-auto">{data.meta.unread} unread in total</span>}
        </div>
        <DataState loading={loading} error={error} onRetry={reload} empty={!data?.data?.length} emptyProps={{ icon: Bell, title: 'No notifications', message: filters.state === 'active' ? 'No active alerts. Inventory is in good shape.' : undefined }}>
          <ul className="divide-y divide-slate-100">
            {data?.data?.map((n) => {
              const Icon = ICONS[n.severity] || Info;
              return (
                <li key={n._id} className={`flex gap-3 px-4 py-4 sm:px-5 ${n.isRead ? '' : 'bg-brand-50/40'}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_CLS[n.severity]}`}><Icon className="h-4 w-4" /></div>
                  <button className="min-w-0 flex-1 text-left" onClick={() => open(n)}>
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.isRead && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      <StatusBadge map={SEVERITY} value={n.severity} />
                      <Badge>{titleCase(n.type)}</Badge>
                      {n.resolvedAt && <Badge tone="green">Resolved</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{n.message}</p>
                    <p className="mt-1 text-xs text-slate-400" title={formatDateTime(n.createdAt)}>
                      {timeAgo(n.createdAt)}{n.resolvedAt ? ` · resolved ${timeAgo(n.resolvedAt)}` : ''}
                    </p>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => toggleRead(n)} aria-label={n.isRead ? 'Mark as unread' : 'Mark as read'} title={n.isRead ? 'Mark as unread' : 'Mark as read'}>
                    {n.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Pagination meta={data?.meta} onPage={(page) => set({ page })} />
        </DataState>
      </Card>
    </>
  );
}
