import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Hotel, LineChart, Lock, PackageCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../services/api.js';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Form.jsx';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

// Demo accounts created by the seed script (documented in README). Remove for production.
const DEMO = [
  { role: 'Administrator', email: 'admin@demo.com', password: 'Admin@123' },
  { role: 'Inventory Manager', email: 'manager@demo.com', password: 'Manager@123' },
  { role: 'Staff (Kitchen)', email: 'staff@demo.com', password: 'Staff@123' },
];
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />;

  const submit = async ({ email, password }) => {
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Sign in failed'));
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-950 p-10 text-brand-100 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Hotel className="h-5 w-5 text-white" /></div>
          <div>
            <p className="font-semibold text-white">Hotel Inventory Optimization</p>
            <p className="text-xs text-brand-300">Cloud-Based Hotel Management System</p>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-semibold text-white">Right stock, right time, less waste.</h1>
          <p className="mt-3 text-brand-200">Track every stock movement, forecast demand from real consumption and get explainable reorder recommendations.</p>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex gap-3"><PackageCheck className="h-5 w-5 shrink-0 text-brand-300" />Real-time stock levels with low-stock, overstock and expiry alerts</li>
            <li className="flex gap-3"><LineChart className="h-5 w-5 shrink-0 text-brand-300" />Moving-average forecasting, EOQ and reorder point calculation</li>
            <li className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-brand-300" />Role-based access with a full audit trail</li>
          </ul>
        </div>
        <p className="text-xs text-brand-400">Need Technosoft Pvt. Ltd. · Internship project</p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-900"><Hotel className="h-5 w-5 text-white" /></div>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your hotel account to continue.</p>

          <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4" noValidate>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <Field label="Email" error={errors.email?.message} htmlFor="email">
              <Input id="email" type="email" autoComplete="username" {...register('email')} error={errors.email} placeholder="you@hotel.com" />
            </Field>
            <Field label="Password" error={errors.password?.message} htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} error={errors.password} />
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting} icon={Lock}>Sign in</Button>
          </form>

          {SHOW_DEMO && (
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts</p>
              <div className="mt-2 space-y-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => { setValue('email', d.email); setValue('password', d.password); }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-700">{d.role}</span>
                    <span className="text-xs text-slate-500">{d.email}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">Click an account to fill the form.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
