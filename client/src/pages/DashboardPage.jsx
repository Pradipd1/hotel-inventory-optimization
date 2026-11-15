import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Boxes, CalendarClock, ClipboardCheck, Gauge, PackageMinus, PackagePlus,
  PackageX, ShoppingCart, Tags, Trash2, TrendingDown, Wallet, Wallet2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../services/endpoints.js';
import { Card, DataState, EmptyState, PageHeader, StatCard, StatusBadge } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DonutChart, MonthlyBarChart, MonthlyLineChart, StockLevelChart, TopConsumedChart, WastageAreaChart } from '../components/charts/Charts.jsx';
import { RecordMovementModal } from '../components/inventory/RecordMovementModal.jsx';
import { MOVEMENT_TYPES, PO_STATUS, STOCK_STATUS } from '../utils/constants.js';
import { formatCurrency, formatDate, formatQty, timeAgo } from '../utils/format.js';

export default function DashboardPage() {
  const { user, isManagement } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => dashboardApi.get(), []);
  const [movementOpen, setMovementOpen] = useState(false);
  const d = data?.data;
  const cur = d?.currency;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || ''}`}
        description={`Inventory overview for ${user?.hotel?.name}. Figures are calculated live from stock movements.`}
        actions={
          <>
            <Button variant="secondary" icon={PackageMinus} onClick={() => setMovementOpen(true)}>Record consumption</Button>
            {isManagement && <Button variant="secondary" icon={PackagePlus} onClick={() => navigate('/inventory?new=1')}>Add item</Button>}
            {isManagement && <Button icon={ShoppingCart} onClick={() => navigate('/purchase-orders/new')}>New purchase order</Button>}
          </>
        }
      />

      <DataState loading={loading} error={error} onRetry={reload}>
        {d && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Total items" value={d.kpis.totalItems} icon={Boxes} hint={`${d.kpis.totalCategories} categories`} onClick={() => navigate('/inventory')} />
              <StatCard label="Stock value" value={formatCurrency(d.kpis.totalStockValue, cur, { compact: true })} title={formatCurrency(d.kpis.totalStockValue, cur)} icon={Wallet} tone="green" hint="Quantity × unit cost" />
              <StatCard label="Low stock" value={d.kpis.lowStock} icon={TrendingDown} tone="amber" hint="At or below reorder point" onClick={() => navigate('/inventory?status=low_stock')} />
              <StatCard label="Out of stock" value={d.kpis.outOfStock} icon={PackageX} tone="red" onClick={() => navigate('/inventory?status=out_of_stock')} />
              <StatCard label="Expiring ≤ 30 days" value={d.kpis.expiringSoon} icon={CalendarClock} tone="amber" hint={d.kpis.expired ? `${d.kpis.expired} already expired` : 'None expired'} onClick={() => navigate('/inventory?status=expiring_soon')} />
              <StatCard label="Pending purchase orders" value={d.kpis.pendingPurchaseOrders} icon={ClipboardCheck} tone="purple" hint={`${d.kpis.awaitingApproval} awaiting approval`} onClick={isManagement ? () => navigate('/purchase-orders') : undefined} />
              <StatCard label="Consumption this month" value={formatCurrency(d.kpis.monthlyConsumptionValue, cur, { compact: true })} title={formatCurrency(d.kpis.monthlyConsumptionValue, cur)} icon={PackageMinus} tone="blue" />
              <StatCard label="Purchases received this month" value={formatCurrency(d.kpis.monthlyPurchaseValue, cur, { compact: true })} title={formatCurrency(d.kpis.monthlyPurchaseValue, cur)} icon={Wallet2} tone="brand" />
              <StatCard label="Wastage this month" value={formatCurrency(d.kpis.monthlyWastageValue, cur, { compact: true })} title={formatCurrency(d.kpis.monthlyWastageValue, cur)} icon={Trash2} tone="red" />
              <StatCard label="Categories" value={d.kpis.totalCategories} icon={Tags} tone="brand" hint={`${d.kpis.overstocked} item(s) overstocked`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card title="Monthly inventory consumption" subtitle="Value of stock issued (last 6 months)" className="xl:col-span-2">
                <MonthlyLineChart data={d.charts.monthlyConsumption} currency={cur} name="Consumption" />
              </Card>
              <Card title="Inventory by category" subtitle="Share of current stock value">
                {d.charts.categoryBreakdown.length ? <DonutChart data={d.charts.categoryBreakdown} currency={cur} /> : <EmptyState title="No stock yet" />}
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Monthly purchasing expenses" subtitle="Value of goods received against purchase orders">
                <MonthlyBarChart data={d.charts.monthlyPurchases} currency={cur} name="Purchases" />
              </Card>
              <Card title="Inventory wastage trend" subtitle="Value written off as wastage">
                <WastageAreaChart data={d.charts.wastageTrend} currency={cur} />
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Stock level overview" subtitle="Items closest to their reorder point">
                <div className="mb-3 flex flex-wrap gap-2">
                  {d.charts.stockStatus.map((s) => (
                    <button key={s.status} onClick={() => navigate(`/inventory?status=${s.status}`)} className="rounded-full">
                      <StatusBadge map={STOCK_STATUS} value={s.status} />
                      <span className="ml-1 text-xs font-semibold text-slate-700">{s.count}</span>
                    </button>
                  ))}
                </div>
                {d.charts.stockLevels.length ? <StockLevelChart data={d.charts.stockLevels} /> : <EmptyState title="No items with a reorder point" />}
              </Card>
              <Card title="Top 5 most consumed products" subtitle="By value, last 30 days">
                {d.charts.topConsumed.length ? <TopConsumedChart data={d.charts.topConsumed} currency={cur} /> : <EmptyState title="No consumption recorded in the last 30 days" />}
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card
                title="Low-stock alerts"
                actions={isManagement && <Link to="/optimization" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Gauge className="h-4 w-4" />Recommendations</Link>}
                bodyClassName="p-0"
              >
                {d.lowStockAlerts.length === 0 ? (
                  <EmptyState title="All items above reorder point" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.lowStockAlerts.map((a) => (
                      <li key={a._id}>
                        <Link to={`/inventory/${a._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                          <AlertTriangle className={`h-4 w-4 shrink-0 ${a.stockStatus === 'out_of_stock' ? 'text-red-500' : 'text-amber-500'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{a.name}</p>
                            <p className="text-xs text-slate-500">{formatQty(a.currentStock, a.unit)} · reorder at {formatQty(a.reorderPoint, a.unit)}</p>
                          </div>
                          <StatusBadge map={STOCK_STATUS} value={a.stockStatus} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Recent inventory activity" actions={<Link to="/movements" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} bodyClassName="p-0">
                {d.recentMovements.length === 0 ? (
                  <EmptyState title="No stock movements yet" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentMovements.map((m) => (
                      <li key={m._id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{m.itemName}</p>
                          <p className="truncate text-xs text-slate-500">{m.performedByName} · {timeAgo(m.occurredAt)}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge map={MOVEMENT_TYPES} value={m.type} />
                          <p className={`mt-0.5 text-xs font-medium tabular-nums ${m.change > 0 ? 'text-emerald-600' : m.change < 0 ? 'text-slate-700' : 'text-slate-500'}`}>
                            {m.change > 0 ? '+' : ''}{m.type === 'transfer' ? `→ ${m.toLocation}` : formatQty(m.change, m.unit)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {isManagement && <Card title="Recent purchase orders" actions={<Link to="/purchase-orders" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} bodyClassName="p-0">
                {d.recentOrders.length === 0 ? (
                  <EmptyState title="No purchase orders yet" />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {d.recentOrders.map((po) => {
                      const content = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800">{po.poNumber}</p>
                            <p className="truncate text-xs text-slate-500">{po.supplier?.name} · {formatDate(po.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <StatusBadge map={PO_STATUS} value={po.status} />
                            <p className="mt-0.5 text-xs font-medium text-slate-700 tabular-nums">{formatCurrency(po.total, cur)}</p>
                          </div>
                          {isManagement && <ArrowRight className="h-4 w-4 text-slate-300" />}
                        </>
                      );
                      return (
                        <li key={po._id}>
                          {isManagement ? (
                            <Link to={`/purchase-orders/${po._id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">{content}</Link>
                          ) : (
                            <div className="flex items-center gap-3 px-5 py-3">{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>}
            </div>
          </div>
        )}
      </DataState>

      <RecordMovementModal open={movementOpen} onClose={() => setMovementOpen(false)} onSaved={reload} />
    </>
  );
}
