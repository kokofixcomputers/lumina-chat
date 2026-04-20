import { useState } from 'react';
import { Key, Shield, ExternalLink, Check, X } from 'lucide-react';
import type { AppSettings } from '../../types';

interface IntegrationsTabProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

interface GitHubIntegration {
  id: string;
  name: string;
  description: string;
  icon: string;
  authType: 'api_key';
  configured: boolean;
  patToken?: string;
  username?: string;
}

const githubIntegration: GitHubIntegration = {
  id: 'github',
  name: 'GitHub',
  description: 'Access repositories, view files, and manage issues with GitHub Personal Access Token',
  icon: 'github',
  authType: 'api_key',
  configured: false,
};

export default function IntegrationsTab({ settings, onUpdateSettings }: IntegrationsTabProps) {
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);
  const [patTokenInput, setPatTokenInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Get GitHub integration state from settings
  const githubConfig = settings.integrations?.github || { configured: false, patToken: '', username: '' };
  const integration = { ...githubIntegration, ...githubConfig };

  const handleConfigure = () => {
    setEditingIntegration('github');
    setPatTokenInput(githubConfig.patToken || '');
    setValidationError('');
  };

  const validateGitHubToken = async (token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid token. Please check your Personal Access Token.' };
        }
        return { valid: false, error: 'Failed to validate token. Please try again.' };
      }

      const userData = await response.json();
      return { valid: true, username: userData.login };
    } catch (error) {
      return { valid: false, error: 'Network error. Please check your connection.' };
    }
  };

  const handleSaveToken = async () => {
    if (!patTokenInput.trim()) {
      setValidationError('Please enter a Personal Access Token');
      return;
    }

    setIsValidating(true);
    setValidationError('');

    const validation = await validateGitHubToken(patTokenInput.trim());

    if (validation.valid && validation.username) {
      // Save to settings
      onUpdateSettings({
        integrations: {
          ...settings.integrations,
          github: {
            configured: true,
            patToken: patTokenInput.trim(),
            username: validation.username
          }
        }
      });

      setPatTokenInput('');
      setEditingIntegration(null);
    } else {
      setValidationError(validation.error || 'Failed to validate token');
    }

    setIsValidating(false);
  };

  const handleDisconnect = () => {
    onUpdateSettings({
      integrations: {
        ...settings.integrations,
        github: {
          configured: false,
          patToken: '',
          username: ''
        }
      }
    });
  };

  const getIntegrationIcon = (iconName: string) => {
    const icons: Record<string, string> = {
      'github': 'GH',
    };
    return icons[iconName] || iconName[0].toUpperCase();
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-2xl">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-4">Available Integrations</h3>
        <p className="text-sm text-[rgb(var(--muted))] mb-4">Connect external services to extend functionality. Configure API keys for secure access.</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between py-3 border-b border-[rgb(var(--border))]">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${
                integration.configured
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : 'bg-[rgb(var(--bg))] text-[rgb(var(--text))]'
              }`}>
                {getIntegrationIcon(integration.icon)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[rgb(var(--text))]">{integration.name}</p>
                  {integration.configured && (
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  )}
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-[rgb(var(--bg))] text-[rgb(var(--muted))] capitalize">
                    {integration.authType.replace('_', ' ')}
                  </span>
                  {integration.configured && integration.username && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      @{integration.username}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[rgb(var(--muted))] mt-1">{integration.description}</p>
              </div>
            </div>

            {editingIntegration === integration.id ? (
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={patTokenInput}
                    onChange={(e) => setPatTokenInput(e.target.value)}
                    className="px-2 py-1 text-xs bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded focus:outline-none focus:ring-1 focus:ring-[rgb(var(--accent))] w-48"
                  />
                </div>
                {validationError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{validationError}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveToken}
                    disabled={isValidating}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {isValidating ? (
                      <>Validating...</>
                    ) : (
                      <>
                        <Check size={12} />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingIntegration(null);
                      setPatTokenInput('');
                      setValidationError('');
                    }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-shrink-0">
                {integration.configured ? (
                  <button
                    onClick={handleDisconnect}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    <X size={12} className="mr-1" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConfigure}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <Key size={12} className="mr-1" />
                    Configure
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
