import type { AppSettings } from '../../types';

interface LocalAgentTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  agentPort: string;
  agentProtocol: 'ws' | 'wss';
  agentEnabled: boolean;
  agentStatus: 'disabled' | 'error' | 'connected';
  setAgentPort: (v: string) => void;
  setAgentProtocol: (v: 'ws' | 'wss') => void;
  setAgentEnabled: (v: boolean) => void;
}

export default function LocalAgentTab({
  settings,
  onUpdateSettings,
  agentPort,
  agentProtocol,
  agentEnabled,
  agentStatus,
  setAgentPort,
  setAgentProtocol,
  setAgentEnabled,
}: LocalAgentTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Local Agent Connection</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">
          Connect Lumina Chat to a agent running locally on your computer for AI to create/edit files.
        </p>
        <div className="form-group">
          <div className="flex items-center justify-between">
            <label className="form-label mb-0">Enable Local Agent</label>
            <button
              onClick={() => {
                const newEnabled = !agentEnabled;
                setAgentEnabled(newEnabled);
                onUpdateSettings({ localAgent: { enabled: newEnabled, port: agentPort, protocol: agentProtocol } });
              }}
              className={`toggle ${agentEnabled ? 'bg-[rgb(var(--accent))]' : 'bg-black/20 dark:bg-white/20'}`}
            >
              <span className={`toggle-thumb ${agentEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
          <p className="form-help">Enable connection to local agent</p>
        </div>
        <div className="form-group">
          <label className="form-label">Protocol</label>
          <div className="flex gap-2">
            {(['ws', 'wss'] as const).map(proto => (
              <button
                key={proto}
                onClick={() => {
                  setAgentProtocol(proto);
                  onUpdateSettings({ localAgent: { enabled: agentEnabled, port: agentPort, protocol: proto } });
                }}
                disabled={!agentEnabled}
                className={`flex-1 rounded-xl px-3.5 py-2 text-xs uppercase font-medium transition-all ${
                  agentProtocol === proto
                    ? 'bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
                    : 'border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                }`}
              >
                {proto}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Port</label>
          <input
            type="text"
            value={agentPort}
            onChange={e => {
              setAgentPort(e.target.value);
              onUpdateSettings({ localAgent: { enabled: agentEnabled, port: e.target.value, protocol: agentProtocol } });
            }}
            className="input text-sm"
            placeholder="14345"
          />
          <p className="form-help">Port number where your local agent is running</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
            agentStatus === 'disabled' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' :
            agentStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
            'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              agentStatus === 'disabled' ? 'bg-gray-400' :
              agentStatus === 'error' ? 'bg-red-500' :
              'bg-green-500'
            }`} />
            {agentStatus === 'disabled' ? 'Disabled' :
             agentStatus === 'error' ? 'Cannot Connect' :
             'Connected'}
          </div>
          {agentStatus === 'connected' && (
            <span className="text-xs text-[rgb(var(--muted))]">
              {agentProtocol}://localhost:{agentPort}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
