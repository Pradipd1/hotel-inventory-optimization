import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { LoadingState, EmptyState } from '../ui/Display.jsx';

/** Requires a signed-in user; otherwise redirects to /login and remembers the target. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><LoadingState label="Loading your workspace..." /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Client-side role gate for pages. The API enforces the same rules on every request. */
export function RequireRole({ roles }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="card">
        <EmptyState icon={ShieldAlert} title="Access restricted" message="Your role does not have permission to view this page. Contact an administrator if you need access." />
      </div>
    );
  }
  return <Outlet />;
}
