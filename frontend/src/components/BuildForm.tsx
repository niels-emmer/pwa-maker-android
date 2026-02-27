import { useState, useEffect, useRef } from 'react';
import type { BuildOptions, DisplayMode, OrientationMode } from '../types.js';
import { useManifest } from '../hooks/useManifest.js';

interface Props {
  onSubmit: (options: BuildOptions) => void;
  disabled: boolean;
}

function derivePackageId(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.').filter(Boolean).reverse();
    const cleaned = parts.map((p) => {
      const s = p.toLowerCase().replace(/[^a-z0-9_]/g, '');
      return /^[a-z]/.test(s) ? s : `a${s}`;
    });
    while (cleaned.length < 3) cleaned.push('app');
    return cleaned.join('.');
  } catch {
    return 'com.example.app';
  }
}

const EMPTY: BuildOptions = {
  pwaUrl: '',
  appName: '',
  shortName: '',
  packageId: 'com.example.app',
  display: 'standalone',
  orientation: 'portrait',
  themeColor: '#000000',
  backgroundColor: '#ffffff',
  iconUrl: '',
  maskableIconUrl: null,
};

function validatePackageId(id: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(id);
}

function validateHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

export function BuildForm({ onSubmit, disabled }: Props) {
  const [form, setForm] = useState<BuildOptions>(EMPTY);
  const [pwaUrlInput, setPwaUrlInput] = useState('');
  const [touched, setTouched] = useState<Partial<Record<keyof BuildOptions, true>>>({});

  // Honeypot ref — invisible to humans; bots that auto-fill all inputs will populate this
  const honeypotRef = useRef<HTMLInputElement>(null);

  const { data: manifest, loading: manifestLoading, error: manifestError } = useManifest(pwaUrlInput);

  // Auto-fill form when manifest loads
  useEffect(() => {
    if (!manifest) return;
    setForm((prev) => ({
      ...prev,
      pwaUrl: manifest.pwaUrl,
      appName: manifest.appName ?? prev.appName,
      shortName: manifest.shortName ?? prev.shortName,
      packageId: manifest.packageId ?? derivePackageId(manifest.pwaUrl),
      display: manifest.display ?? prev.display,
      orientation: manifest.orientation ?? prev.orientation,
      themeColor: manifest.themeColor ?? prev.themeColor,
      backgroundColor: manifest.backgroundColor ?? prev.backgroundColor,
      iconUrl: manifest.iconUrl ?? prev.iconUrl,
      maskableIconUrl: manifest.maskableIconUrl ?? prev.maskableIconUrl,
    }));
  }, [manifest]);

  // Keep pwaUrl in form in sync
  useEffect(() => {
    try {
      const url = new URL(pwaUrlInput.trim());
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        setForm((prev) => ({ ...prev, pwaUrl: pwaUrlInput.trim() }));
      }
    } catch {
      setForm((prev) => ({ ...prev, pwaUrl: '' }));
    }
  }, [pwaUrlInput]);

  const set = <K extends keyof BuildOptions>(key: K, value: BuildOptions[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  };

  const errors: Partial<Record<keyof BuildOptions, string>> = {};
  if (touched.pwaUrl && !form.pwaUrl) errors.pwaUrl = 'Required';
  if (touched.appName && !form.appName.trim()) errors.appName = 'Required';
  if (touched.shortName && form.shortName.length > 12) errors.shortName = 'Max 12 characters';
  if (touched.packageId && !validatePackageId(form.packageId))
    errors.packageId = 'Must be like com.example.app';
  if (touched.themeColor && !validateHex(form.themeColor))
    errors.themeColor = 'Must be a 6-digit hex color';
  if (touched.backgroundColor && !validateHex(form.backgroundColor))
    errors.backgroundColor = 'Must be a 6-digit hex color';
  if (touched.iconUrl && !form.iconUrl) errors.iconUrl = 'Required';

  const isFormValid =
    form.pwaUrl &&
    form.appName.trim() &&
    form.shortName.trim() &&
    validatePackageId(form.packageId) &&
    validateHex(form.themeColor) &&
    validateHex(form.backgroundColor) &&
    form.iconUrl;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || disabled) return;
    // Honeypot: bots that auto-fill all fields will have populated this hidden input.
    // Silently drop the submission — no error shown, bot gets no signal.
    if (honeypotRef.current?.value) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label="Build configuration">
      {/* ── URL ── */}
      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          PWA URL
        </h2>
        <div>
          <label htmlFor="pwaUrl" className="block text-sm text-muted mb-1">
            Website URL <span className="text-danger">*</span>
          </label>
          <div className="relative">
            <input
              id="pwaUrl"
              type="url"
              autoComplete="url"
              placeholder="https://your-pwa.example.com"
              value={pwaUrlInput}
              onChange={(e) => {
                setPwaUrlInput(e.target.value);
                setTouched((t) => ({ ...t, pwaUrl: true }));
              }}
              disabled={disabled}
              className={`input w-full pr-10 ${errors.pwaUrl ? 'border-danger' : ''}`}
              aria-describedby={manifestError ? 'manifest-error' : undefined}
            />
            {manifestLoading && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Loading manifest"
              >
                <svg className="animate-spin w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </span>
            )}
          </div>
          {manifestError && (
            <p id="manifest-error" className="text-xs text-warning mt-1" role="alert">
              Could not fetch manifest: {manifestError} — you can still fill in the fields manually.
            </p>
          )}
          {manifest && !manifestError && (
            <p className="text-xs text-success mt-1" role="status">
              Manifest loaded — fields auto-filled below.
            </p>
          )}
        </div>
      </section>

      {/* ── App identity ── */}
      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          App identity
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="appName"
            label="App name"
            required
            error={errors.appName}
            hint="Shown in launcher and app drawer"
          >
            <input
              id="appName"
              type="text"
              maxLength={50}
              value={form.appName}
              onChange={(e) => set('appName', e.target.value)}
              disabled={disabled}
              className={`input w-full ${errors.appName ? 'border-danger' : ''}`}
            />
          </Field>

          <Field
            id="shortName"
            label="Short name"
            required
            error={errors.shortName}
            hint="Under the icon on home screen (max 12)"
          >
            <input
              id="shortName"
              type="text"
              maxLength={12}
              value={form.shortName}
              onChange={(e) => set('shortName', e.target.value.slice(0, 12))}
              disabled={disabled}
              className={`input w-full ${errors.shortName ? 'border-danger' : ''}`}
            />
          </Field>

          <Field
            id="packageId"
            label="Package ID"
            required
            error={errors.packageId}
            hint="Unique Android identifier"
            className="sm:col-span-2"
          >
            <input
              id="packageId"
              type="text"
              value={form.packageId}
              onChange={(e) => set('packageId', e.target.value.toLowerCase())}
              disabled={disabled}
              className={`input w-full font-mono text-sm ${errors.packageId ? 'border-danger' : ''}`}
              placeholder="com.example.myapp"
            />
          </Field>
        </div>
      </section>

      {/* ── Appearance ── */}
      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Appearance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="themeColor" label="Theme color" required error={errors.themeColor}>
            <div className="flex gap-2">
              <input
                id="themeColor"
                type="color"
                value={form.themeColor}
                onChange={(e) => set('themeColor', e.target.value)}
                disabled={disabled}
                className="w-10 h-10 rounded-lg border border-border bg-surface-2 cursor-pointer p-0.5"
                aria-label="Theme color picker"
              />
              <input
                type="text"
                value={form.themeColor}
                onChange={(e) => set('themeColor', e.target.value)}
                disabled={disabled}
                className={`input flex-1 font-mono text-sm ${errors.themeColor ? 'border-danger' : ''}`}
                placeholder="#000000"
                aria-label="Theme color hex"
              />
            </div>
          </Field>

          <Field id="backgroundColor" label="Background color" required error={errors.backgroundColor}>
            <div className="flex gap-2">
              <input
                id="backgroundColor"
                type="color"
                value={form.backgroundColor}
                onChange={(e) => set('backgroundColor', e.target.value)}
                disabled={disabled}
                className="w-10 h-10 rounded-lg border border-border bg-surface-2 cursor-pointer p-0.5"
                aria-label="Background color picker"
              />
              <input
                type="text"
                value={form.backgroundColor}
                onChange={(e) => set('backgroundColor', e.target.value)}
                disabled={disabled}
                className={`input flex-1 font-mono text-sm ${errors.backgroundColor ? 'border-danger' : ''}`}
                placeholder="#ffffff"
                aria-label="Background color hex"
              />
            </div>
          </Field>

          <Field
            id="display"
            label="Display mode"
            hint="How much browser UI to show"
          >
            <Select
              id="display"
              value={form.display}
              onChange={(v) => set('display', v as DisplayMode)}
              disabled={disabled}
              options={[
                { value: 'standalone', label: 'Standalone (no browser bar)' },
                { value: 'fullscreen', label: 'Fullscreen' },
                { value: 'minimal-ui', label: 'Minimal UI' },
              ]}
            />
          </Field>

          <Field id="orientation" label="Orientation">
            <Select
              id="orientation"
              value={form.orientation}
              onChange={(v) => set('orientation', v as OrientationMode)}
              disabled={disabled}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
                { value: 'default', label: 'Any (follow device)' },
              ]}
            />
          </Field>
        </div>
      </section>

      {/* ── Icons ── */}
      <section>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Icon
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="iconUrl"
            label="Icon URL"
            required
            error={errors.iconUrl}
            hint="Must be ≥ 512×512 px"
            className="sm:col-span-2"
          >
            <div className="flex gap-3 items-start">
              {form.iconUrl && (
                <img
                  src={form.iconUrl}
                  alt="App icon preview"
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-border bg-surface-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <input
                id="iconUrl"
                type="url"
                value={form.iconUrl}
                onChange={(e) => set('iconUrl', e.target.value)}
                disabled={disabled}
                className={`input flex-1 ${errors.iconUrl ? 'border-danger' : ''}`}
                placeholder="https://example.com/icon-512.png"
              />
            </div>
          </Field>

          <Field
            id="maskableIconUrl"
            label="Maskable icon URL"
            hint="Optional — used for shaped icons on Android"
            className="sm:col-span-2"
          >
            <input
              id="maskableIconUrl"
              type="url"
              value={form.maskableIconUrl ?? ''}
              onChange={(e) =>
                set('maskableIconUrl', e.target.value || null)
              }
              disabled={disabled}
              className="input w-full"
              placeholder="https://example.com/icon-maskable.png"
            />
          </Field>
        </div>
      </section>

      {/* ── Honeypot — invisible to humans, filled by bot auto-fillers ── */}
      <input
        ref={honeypotRef}
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        style={{
          position: 'absolute',
          opacity: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      />

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={!isFormValid || disabled}
        className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {disabled ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Building…
          </span>
        ) : (
          'Generate APK'
        )}
      </button>
    </form>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

function Field({ id, label, required, error, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm text-muted mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
      {error && (
        <p className="text-xs text-danger mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}

function Select({ id, value, onChange, disabled, options }: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="input w-full"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
