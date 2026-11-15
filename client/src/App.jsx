import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ROLES } from './context/AuthContext.jsx';
import { RequireAuth, RequireRole } from './components/layout/Guards.jsx';
import { LoadingState } from './components/ui/Display.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';

// Route-level code splitting keeps the initial bundle small.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const ItemDetailPage = lazy(() => import('./pages/ItemDetailPage.jsx'));
const MovementsPage = lazy(() => import('./pages/MovementsPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'));
const OptimizationPage = lazy(() => import('./pages/OptimizationPage.jsx'));
const PurchaseOrdersPage = lazy(() => import('./pages/PurchaseOrdersPage.jsx'));
const PurchaseOrderFormPage = lazy(() => import('./pages/PurchaseOrderFormPage.jsx'));
const PurchaseOrderDetailPage = lazy(() => import('./pages/PurchaseOrderDetailPage.jsx'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage.jsx'));
const SupplierDetailPage = lazy(() => import('./pages/SupplierDetailPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

const MANAGEMENT = [ROLES.ADMIN, ROLES.MANAGER];

export default function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory/:id" element={<ItemDetailPage />} />
            <Route path="movements" element={<MovementsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />

            <Route element={<RequireRole roles={MANAGEMENT} />}>
              <Route path="optimization" element={<OptimizationPage />} />
              <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
              <Route path="purchase-orders/new" element={<PurchaseOrderFormPage />} />
              <Route path="purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
              <Route path="purchase-orders/:id/edit" element={<PurchaseOrderFormPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="suppliers/:id" element={<SupplierDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
            </Route>

            <Route element={<RequireRole roles={[ROLES.ADMIN]} />}>
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit-logs" element={<AuditLogPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
