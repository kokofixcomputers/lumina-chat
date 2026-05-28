const VERSION_STORAGE_KEY = 'lumina_chat_version';
const CURRENT_VERSION = '0.0.0'; // This should match package.json version

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

export const getCurrentVersion = () => CURRENT_VERSION;

export const getStoredVersion = (): string | null => {
  return localStorage.getItem(VERSION_STORAGE_KEY);
};

export const setStoredVersion = (version: string) => {
  localStorage.setItem(VERSION_STORAGE_KEY, version);
};

export const isVersionUpdated = (): boolean => {
  const stored = getStoredVersion();
  if (!stored) return true; // First time using the app
  return stored !== CURRENT_VERSION;
};

export const fetchLatestRelease = async (): Promise<GitHubRelease | null> => {
  try {
    const response = await fetch('https://api.github.com/repos/kokofixcomputers/lumina-chat/releases/latest');
    if (!response.ok) {
      throw new Error('Failed to fetch release');
    }
    const release: GitHubRelease = await response.json();
    return release;
  } catch (error) {
    console.error('Failed to fetch latest release:', error);
    return null;
  }
};

export const checkForUpdate = async (): Promise<{ hasUpdate: boolean; release: GitHubRelease | null }> => {
  const release = await fetchLatestRelease();
  if (!release) return { hasUpdate: false, release: null };

  const latestVersion = release.tag_name.replace(/^v/, '');
  const hasUpdate = latestVersion !== CURRENT_VERSION;

  return { hasUpdate, release };
};
