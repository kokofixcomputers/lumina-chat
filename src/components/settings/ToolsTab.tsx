import type { AppSettings } from '../../types';

interface ToolsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

export default function ToolsTab({ settings, onUpdateSettings }: ToolsTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Enable / Disable Tools</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">Disabled tools are excluded from every request before they are loaded.</p>
        <div className="space-y-2">
          {[
            { name: 'get_current_time', label: 'get_current_time', desc: 'Get the current date and time', requiresKey: null },
            { name: 'calculate', label: 'calculate', desc: 'Perform mathematical calculations', requiresKey: null },
            { name: 'chart', label: 'chart', desc: 'Generate dynamic charts using Chart.js', requiresKey: null },
            { name: 'exec_python', label: 'exec_python', desc: 'Execute Python code using Pyodide (numpy, pandas, matplotlib)', requiresKey: null },
            { name: 'google_search', label: 'google_search', desc: 'Search Google for information', requiresKey: 'serper' },
            { name: 'amazon_search', label: 'amazon_search', desc: 'Search Amazon products in real-time', requiresKey: 'serper' },
            { name: 'city_search', label: 'city_search', desc: 'Search for cities (use with hotel_search)', requiresKey: 'serper' },
            { name: 'hotel_search', label: 'hotel_search', desc: 'Search hotels in a city', requiresKey: 'serper' },
            { name: 'hotel_search_page', label: 'hotel_search_page', desc: 'Fetch next page of hotel results', requiresKey: 'serper' },
            { name: 'web_request', label: 'web_request', desc: 'Fetch and scrape content from a URL', requiresKey: 'scrapingbee' },
            { name: 'qanda', label: 'qanda', desc: 'Ask the user clarifying questions', requiresKey: null },
            { name: 'create_dev_env', label: 'create_dev_env', desc: 'Create Alpine Linux dev environment', requiresKey: null },
            { name: 'command_dev_env', label: 'command_dev_env', desc: 'Execute commands in dev environment', requiresKey: null },
            { name: 'artifact_dev_env', label: 'artifact_dev_env', desc: 'Download files from dev environment', requiresKey: null },
          ].map(({ name, label, desc, requiresKey }) => {
            const disabled = (settings.disabledTools || []).includes(name);
            return (
              <div key={name} className="flex items-center justify-between py-2 border-b border-[rgb(var(--border))] last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono">{label}</p>
                    {requiresKey && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                        requiresKey === 'serper' 
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}>
                        {requiresKey === 'serper' ? 'Serper' : 'ScrapingBee'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[rgb(var(--muted))]">{desc}</p>
                </div>
                <button
                  onClick={() => {
                    const current = settings.disabledTools || [];
                    onUpdateSettings({
                      disabledTools: disabled
                        ? current.filter(t => t !== name)
                        : [...current, name],
                    });
                  }}
                  className={`toggle ${!disabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                >
                  <span className={`toggle-thumb ${!disabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Dev Env</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">
          Configure the development environment tool that allows AI to create and execute commands in isolated Alpine Linux containers.
        </p>

        <div className="form-group">
          <label className="form-label">WebSocket Address</label>
          <input
            type="text"
            value={settings.devEnv?.address || 'ws://localhost:8765'}
            onChange={e => onUpdateSettings({ devEnv: { ...settings.devEnv, address: e.target.value } })}
            className="input text-sm font-mono"
            placeholder="ws://localhost:8765"
          />
          <p className="form-help">WebSocket server address for dev environment</p>
        </div>

        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            type="password"
            value={settings.devEnv?.apiKey || 'kk_your_api_key_here'}
            onChange={e => onUpdateSettings({ devEnv: { ...settings.devEnv, apiKey: e.target.value } })}
            className="input text-sm font-mono"
            placeholder="kk_your_api_key_here"
          />
          <p className="form-help">API key for authenticating with the dev environment server</p>
        </div>

        <div className="space-y-3 mt-6">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Tool Availability</h4>

          <div className="form-group">
            <div className="flex items-center justify-between">
              <div>
                <label className="form-label mb-0">create_dev_env</label>
                <p className="text-xs text-[rgb(var(--muted))]">Create Alpine Linux environment</p>
              </div>
              <button
                onClick={() => onUpdateSettings({
                  devEnv: {
                    ...settings.devEnv,
                    tools: {
                      ...settings.devEnv?.tools,
                      createDevEnv: !(settings.devEnv?.tools?.createDevEnv ?? true)
                    }
                  }
                })}
                className={`toggle ${(settings.devEnv?.tools?.createDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
              >
                <span className={`toggle-thumb ${(settings.devEnv?.tools?.createDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <div className="flex items-center justify-between">
              <div>
                <label className="form-label mb-0">command_dev_env</label>
                <p className="text-xs text-[rgb(var(--muted))]">Execute commands in dev environment</p>
              </div>
              <button
                onClick={() => onUpdateSettings({
                  devEnv: {
                    ...settings.devEnv,
                    tools: {
                      ...settings.devEnv?.tools,
                      commandDevEnv: !(settings.devEnv?.tools?.commandDevEnv ?? true)
                    }
                  }
                })}
                className={`toggle ${(settings.devEnv?.tools?.commandDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
              >
                <span className={`toggle-thumb ${(settings.devEnv?.tools?.commandDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <div className="flex items-center justify-between">
              <div>
                <label className="form-label mb-0">artifact_dev_env</label>
                <p className="text-xs text-[rgb(var(--muted))]">Download files from dev environment</p>
              </div>
              <button
                onClick={() => onUpdateSettings({
                  devEnv: {
                    ...settings.devEnv,
                    tools: {
                      ...settings.devEnv?.tools,
                      artifactDevEnv: !(settings.devEnv?.tools?.artifactDevEnv ?? true)
                    }
                  }
                })}
                className={`toggle ${(settings.devEnv?.tools?.artifactDevEnv ?? true) ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
              >
                <span className={`toggle-thumb ${(settings.devEnv?.tools?.artifactDevEnv ?? true) ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </section>
      
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">API Keys</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">
          Configure API keys for external services used by various tools.
        </p>

        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">Serper API Key</label>
            <input
              type="password"
              value={settings.serperApiKey || ''}
              onChange={e => onUpdateSettings({ serperApiKey: e.target.value })}
              className="input text-sm font-mono"
              placeholder="Enter your Serper API key"
            />
            <p className="form-help">
              API key for Google Search functionality. Get your key at{' '}
              <a 
                href="https://serper.dev" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                serper.dev
              </a>
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">ScrapingBee API Key</label>
            <input
              type="password"
              value={settings.scrapingBeeApiKey || ''}
              onChange={e => onUpdateSettings({ scrapingBeeApiKey: e.target.value })}
              className="input text-sm font-mono"
              placeholder="Enter your ScrapingBee API key"
            />
            <p className="form-help">
              API key for web scraping functionality. Get your key at{' '}
              <a 
                href="https://www.scrapingbee.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                scrapingbee.com
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
