export interface AppField { key: string; label: string; type: string; required?: boolean }
export interface AppEntity { name: string; label: string; userScoped?: boolean; fields: AppField[] }
export interface AppView { id: string; type: 'form' | 'table' | 'dashboard' | 'unknown'; entity: string; title: Record<string, string> }
export interface AppConfig {
  appName: string;
  entities: AppEntity[];
  views: AppView[];
  auth: { methods: string[] };
  localization: {
    defaultLanguage: string;
    languages: string[];
    translations: Record<string, Record<string, string>>;
  };
}
