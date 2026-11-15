import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { settingsApi } from '../services/endpoints.js';
import { errorMessage } from '../services/api.js';
import { Card, DataState, PageHeader } from '../components/ui/Display.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, numberOrNull } from '../components/ui/Form.jsx';

const INT_FIELDS = ['expiryWarningDays', 'expiryCriticalDays', 'forecastWindowDays', 'forecastHorizonDays'];

export default function SettingsPage() {
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const { data, loading, error, reload } = useApi(() => settingsApi.get(), []);
  const hotel = data?.data;
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting, isDirty } } = useForm();

  useEffect(() => {
    if (hotel) {
      const s = hotel.settings || {};
      reset({
        name: hotel.name, address: hotel.address || '', phone: hotel.phone || '', email: hotel.email || '',
        currency: s.currency, expiryWarningDays: s.expiryWarningDays, expiryCriticalDays: s.expiryCriticalDays,
        forecastWindowDays: s.forecastWindowDays, forecastHorizonDays: s.forecastHorizonDays,
        defaultOrderingCost: s.defaultOrderingCost ?? '', holdingCostRate: s.holdingCostRate ?? '',
        significantAdjustmentValue: s.significantAdjustmentValue, defaultTaxRate: s.defaultTaxRate,
      });
    }
  }, [hotel, reset]);

  const warning = Number(watch('expiryWarningDays'));

  const submit = async (v) => {
    const settings = {
      currency: v.currency.trim().toUpperCase(),
      ...Object.fromEntries(INT_FIELDS.map((f) => [f, parseInt(v[f], 10)])),
      defaultOrderingCost: numberOrNull(v.defaultOrderingCost),
      holdingCostRate: numberOrNull(v.holdingCostRate),
      significantAdjustmentValue: Number(v.significantAdjustmentValue) || 0,
      defaultTaxRate: Number(v.defaultTaxRate) || 0,
    };
    try {
      const res = await settingsApi.update({ name: v.name, address: v.address, phone: v.phone, email: v.email, settings });
      toast.success(`${res.message}. Alerts have been re-evaluated.`);
      await refreshProfile();
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const intRule = (min, max) => ({ required: 'Required', min: { value: min, message: `Min ${min}` }, max: { value: max, message: `Max ${max}` } });

  return (
    <>
      <PageHeader title="Hotel settings" description="Inventory rules and the cost parameters used by the optimization engine." actions={<Button type="submit" form="settings-form" icon={Save} loading={isSubmitting} disabled={!isDirty}>Save settings</Button>} />
      <DataState loading={loading} error={error} onRetry={reload}>
        <form id="settings-form" onSubmit={handleSubmit(submit)} noValidate className="grid gap-6 lg:grid-cols-2">
          <Card title="Hotel profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hotel name" required error={errors.name?.message} className="sm:col-span-2"><Input {...register('name', { required: 'Required' })} error={errors.name} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input {...register('address')} /></Field>
              <Field label="Phone"><Input {...register('phone')} /></Field>
              <Field label="Email"><Input type="email" {...register('email')} /></Field>
              <Field label="Currency code" required error={errors.currency?.message} hint="ISO code, e.g. NPR, USD"><Input {...register('currency', { required: 'Required', maxLength: { value: 8, message: 'Too long' } })} error={errors.currency} /></Field>
              <Field label="Default tax rate (%)" hint="Applied to new purchase orders"><Input type="number" step="any" min="0" max="100" {...register('defaultTaxRate', { min: 0, max: 100 })} /></Field>
            </div>
          </Card>

          <Card title="Expiry alerts">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Warning window (days)" error={errors.expiryWarningDays?.message} hint="“Expiring soon” alert"><Input type="number" {...register('expiryWarningDays', intRule(1, 365))} error={errors.expiryWarningDays} /></Field>
              <Field label="Critical window (days)" error={errors.expiryCriticalDays?.message} hint="Critical alert"><Input type="number" {...register('expiryCriticalDays', { ...intRule(1, 90), validate: (v) => Number(v) <= warning || 'Must not exceed the warning window' })} error={errors.expiryCriticalDays} /></Field>
              <Field label="Significant adjustment value" hint="Adjustments worth more than this (or ≥ 25% of stock) notify managers" className="sm:col-span-2"><Input type="number" min="0" step="any" {...register('significantAdjustmentValue', { min: 0 })} /></Field>
            </div>
          </Card>

          <Card title="Forecasting" subtitle="Simple moving average over recorded consumption">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Averaging window (days)" error={errors.forecastWindowDays?.message} hint="How many past days are averaged"><Input type="number" {...register('forecastWindowDays', intRule(7, 365))} error={errors.forecastWindowDays} /></Field>
              <Field label="Forecast horizon (days)" error={errors.forecastHorizonDays?.message} hint="Period for predicted demand"><Input type="number" {...register('forecastHorizonDays', intRule(1, 180))} error={errors.forecastHorizonDays} /></Field>
            </div>
          </Card>

          <Card title="EOQ cost parameters" subtitle="Hotel-wide defaults; items can override them. Leave empty if unknown: EOQ will be reported as not calculable.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ordering cost per order (S)" hint="Admin, transport and receiving cost"><Input type="number" min="0" step="any" {...register('defaultOrderingCost')} /></Field>
              <Field label="Holding cost rate (% per year)" hint="H = rate × unit cost"><Input type="number" min="0" max="100" step="any" {...register('holdingCostRate')} /></Field>
            </div>
          </Card>
        </form>
      </DataState>
    </>
  );
}
