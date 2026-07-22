import { useEffect, useState } from 'react';
import { extensionUIRegistry, ExtSettingsField } from '../../extensions/extensionUIRegistry';
import { getExtensionSettingValue, setExtensionSettingValue } from '../../extensions/extensionSystem';

interface ExtensionSettingsPanelProps {
  extensionId: string;
}

function fieldValue(extensionId: string, field: ExtSettingsField): string | number | boolean {
  const stored = getExtensionSettingValue(extensionId, field.key);
  if (stored !== undefined) return stored as string | number | boolean;
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case 'slider': return field.min ?? 0;
    case 'toggle':
    case 'checkbox': return false;
    case 'color': return '#8b5cf6';
    default: return '';
  }
}

function SettingsField({ field, value, onChange }: {
  field: ExtSettingsField;
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  switch (field.type) {
    case 'slider':
      return (
        <div className="form-group mb-0">
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">{field.label}</label>
            <span className="text-xs font-mono text-[rgb(var(--accent-contrast))] bg-[rgb(var(--accent))] px-2.5 py-1 rounded-full shadow-sm">
              {value}
            </span>
          </div>
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={Number(value)}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full"
          />
          {field.description && <p className="form-help">{field.description}</p>}
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{field.label}</p>
            {field.description && <p className="form-help mt-0.5">{field.description}</p>}
          </div>
          <button
            onClick={() => onChange(!value)}
            className={`toggle w-10 h-5 shrink-0 ${value ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
          >
            <span className={`toggle-thumb w-4 h-4 ${value ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            className="w-4 h-4 accent-[rgb(var(--accent))] shrink-0"
          />
          <div className="min-w-0">
            <span className="text-[13px] font-medium">{field.label}</span>
            {field.description && <p className="form-help mt-0.5">{field.description}</p>}
          </div>
        </label>
      );

    case 'color':
      return (
        <div className="form-group mb-0">
          <label className="form-label">{field.label}</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={String(value)}
              onChange={e => onChange(e.target.value)}
              className="w-9 h-9 rounded-lg border border-[rgb(var(--border))] cursor-pointer bg-transparent shrink-0"
            />
            <span className="text-[13px] font-semibold truncate" style={{ color: String(value) }}>
              {field.label}
            </span>
            <span className="text-xs font-mono text-[rgb(var(--muted))] ml-auto">{String(value)}</span>
          </div>
          {field.description && <p className="form-help">{field.description}</p>}
        </div>
      );

    case 'text':
    default:
      return (
        <div className="form-group mb-0">
          <label className="form-label">{field.label}</label>
          <input
            type="text"
            className="input"
            value={String(value)}
            placeholder={field.placeholder}
            onChange={e => onChange(e.target.value)}
          />
          {field.description && <p className="form-help">{field.description}</p>}
        </div>
      );
  }
}

// Renders inline — right inside the extension's row in Settings → Extensions,
// beside the enable/disable toggle — not as a separate modal/dialog.
export default function ExtensionSettingsPanel({ extensionId }: ExtensionSettingsPanelProps) {
  const schema = extensionUIRegistry.getSettingsSchema(extensionId);
  const [values, setValues] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (!schema) return;
    const initial: Record<string, string | number | boolean> = {};
    for (const field of schema.fields) initial[field.key] = fieldValue(extensionId, field);
    setValues(initial);
  }, [extensionId, schema]);

  const handleChange = (key: string, value: string | number | boolean) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setExtensionSettingValue(extensionId, key, value);
  };

  if (!schema?.fields.length) return null;

  return (
    <div className="glass-inset p-4 space-y-4 animate-slide-in-up">
      {schema.title && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">{schema.title}</p>
      )}
      {schema.fields.map(field => (
        <SettingsField
          key={field.key}
          field={field}
          value={values[field.key] ?? fieldValue(extensionId, field)}
          onChange={v => handleChange(field.key, v)}
        />
      ))}
    </div>
  );
}
