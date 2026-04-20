import type { AppSettings } from '../../types';
import { toolsConfig, apiKeysConfig, getApiKeyColor, getExtensionToolsConfig } from '../../config/toolsConfig';

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
          {[...toolsConfig, ...getExtensionToolsConfig()].map((tool) => {
            const disabled = (settings.disabledTools || []).includes(tool.name);
            const hasApiKey = tool.requiresApiKey ? settings[tool.requiresApiKey.key as keyof AppSettings] : true;
            
            return (
              <div key={tool.name} className="flex items-center justify-between py-2 border-b border-[rgb(var(--border))] last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono">{tool.label}</p>
                    {tool.category === 'extension' && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        Extension
                      </span>
                    )}
                    {tool.requiresApiKey && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded ${getApiKeyColor(tool.requiresApiKey.color)}`}>
                        {tool.requiresApiKey.serviceName}
                      </span>
                    )}
                    {tool.requiresApiKey && !hasApiKey && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        No Key
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[rgb(var(--muted))]">{tool.description}</p>
                </div>
                <button
                  onClick={() => {
                    const current = settings.disabledTools || [];
                    onUpdateSettings({
                      disabledTools: disabled
                        ? current.filter(t => t !== tool.name)
                        : [...current, tool.name],
                    });
                  }}
                  className={`toggle ${!disabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
                  disabled={tool.requiresApiKey && !hasApiKey}
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
          {apiKeysConfig.map((apiKeyConfig) => {
            const keyValue = settings[apiKeyConfig.key as keyof AppSettings] as string || '';
            const toolsUsingKey = toolsConfig.filter(tool => tool.requiresApiKey?.key === apiKeyConfig.key);
            
            return (
              <div key={apiKeyConfig.key} className="form-group">
                <div className="flex items-center gap-2 mb-2">
                  <label className="form-label mb-0">{apiKeyConfig.label}</label>
                  <span className={`px-1.5 py-0.5 text-[10px] rounded ${getApiKeyColor(apiKeyConfig.color)}`}>
                    {apiKeyConfig.serviceName}
                  </span>
                </div>
                <input
                  type="password"
                  value={keyValue}
                  onChange={e => onUpdateSettings({ [apiKeyConfig.key]: e.target.value })}
                  className="input text-sm font-mono"
                  placeholder={apiKeyConfig.placeholder}
                />
                <p className="form-help">
                  {apiKeyConfig.description}. {apiKeyConfig.helpText && (
                    <>
                      Get your key at{' '}
                      <a 
                        href={apiKeyConfig.helpUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {apiKeyConfig.helpUrl.replace('https://www.', '').replace('https://', '')}
                      </a>
                    </>
                  )}
                  {toolsUsingKey.length > 0 && (
                    <>
                      {' '}Used by:{' '}
                      {toolsUsingKey.map(tool => tool.label).join(', ')}
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
