import { useEffect, useMemo, useState } from 'react';
import { AppConfig, AppEntity } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type RecordRow = { id: string; [key: string]: unknown };

export function App() {
  const [token, setToken] = useState<string>('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeEntity, setActiveEntity] = useState<string>('');
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [csvText, setCsvText] = useState('');

  const entity = useMemo(
    () => config?.entities.find((e) => e.name === activeEntity) ?? config?.entities[0],
    [config, activeEntity]
  );

  async function auth(path: string, body: object) {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? 'Auth failed');
    setToken(json.token);
  }

  async function fetchMetadata(nextToken = token) {
    if (!nextToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/metadata`, {
        headers: { Authorization: `Bearer ${nextToken}` }
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to fetch metadata');
      setConfig(json);
      setLang(json.localization.defaultLanguage || 'en');
      if (json.entities.length > 0) setActiveEntity(json.entities[0].name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRecords(entityName = entity?.name) {
    if (!token || !entityName) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${entityName}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to fetch records');
      setRecords(json.items || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRecords();
  }, [entity?.name]);

  async function createRecord(formData: FormData) {
    if (!entity) return;
    const body = Object.fromEntries(formData.entries());
    const response = await fetch(`${API_URL}/api/${entity.name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (!response.ok) return setError(json.error ?? 'Create failed');
    fetchRecords(entity.name);
  }

  async function importCsv() {
    if (!entity || !csvText.trim()) return;
    const mapping = Object.fromEntries(entity.fields.map((f) => [f.label, f.key]));
    const response = await fetch(`${API_URL}/api/${entity.name}/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ csvText, mapping })
    });
    const json = await response.json();
    if (!response.ok) return setError(json.error ?? 'Import failed');
    setCsvText('');
    fetchRecords(entity.name);
    alert(`Imported ${json.inserted}/${json.totalRows} rows`);
  }

  function t(key: string) {
    return config?.localization.translations[key]?.[lang] ?? key;
  }

  if (!token) {
    return (
      <main className="container">
        <h1>Config App Generator</h1>
        <p>Login method: email/password or guest.</p>
        <div className="auth-grid">
          <button onClick={async () => auth('/auth/guest', {})}>Guest Login</button>
          <button
            onClick={async () => {
              try {
                await fetch(`${API_URL}/auth/register`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'demo@example.com', password: 'password123' })
                });
              } catch {
                // No-op if already registered
              }
              await auth('/auth/login', { email: 'demo@example.com', password: 'password123' });
            }}
          >
            Demo Email Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>{config?.appName ?? 'Loading...'}</h1>
        <div>
          <button onClick={() => fetchMetadata()}>{t('refresh')}</button>
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            {config?.localization.languages.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </header>

      {!config && <button onClick={() => fetchMetadata()}>{t('load_app')}</button>}
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      {config && (
        <div className="layout">
          <aside>
            <h3>{t('entities')}</h3>
            {config.entities.map((e) => (
              <button key={e.name} className={entity?.name === e.name ? 'active' : ''} onClick={() => setActiveEntity(e.name)}>
                {e.label}
              </button>
            ))}
          </aside>

          <section>
            {!entity && <p>Unknown entity configured.</p>}
            {entity && (
              <>
                <DynamicForm entity={entity} onSubmit={createRecord} t={t} />
                <CsvImportPanel csvText={csvText} setCsvText={setCsvText} onImport={importCsv} />
                <DynamicTable entity={entity} rows={records} />
                <DynamicDashboard rows={records} />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function DynamicForm({ entity, onSubmit, t }: { entity: AppEntity; onSubmit: (fd: FormData) => void; t: (key: string) => string }) {
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
        e.currentTarget.reset();
      }}
    >
      <h2>{t('create_record')} - {entity.label}</h2>
      <div className="grid">
        {entity.fields.map((f) => (
          <label key={f.key}>
            {f.label}
            <input name={f.key} type={f.type === 'number' ? 'number' : 'text'} required={Boolean(f.required)} />
          </label>
        ))}
      </div>
      <button type="submit">{t('save')}</button>
    </form>
  );
}

function DynamicTable({ entity, rows }: { entity: AppEntity; rows: RecordRow[] }) {
  return (
    <div className="card">
      <h2>{entity.label} Table</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {entity.fields.map((f) => <th key={f.key}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {entity.fields.map((f) => <td key={f.key}>{String(row[f.key] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DynamicDashboard({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="card">
      <h2>Dashboard</h2>
      <p>Total records: {rows.length}</p>
    </div>
  );
}

function CsvImportPanel({ csvText, setCsvText, onImport }: { csvText: string; setCsvText: (value: string) => void; onImport: () => void }) {
  return (
    <div className="card">
      <h2>CSV Import</h2>
      <textarea
        rows={5}
        placeholder="Paste CSV with headers matching field labels"
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
      />
      <button onClick={onImport}>Import CSV</button>
    </div>
  );
}
