import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faApple, faMicrosoft, faUbuntu } from '@fortawesome/free-brands-svg-icons';
import { ChevronLeft, Download, Check, Loader2, Info, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

type HypeLoadingState = Record<string, boolean>;

const OS_OPTIONS = [
  { id: 'macos', name: 'macOS', icon: faApple },
  { id: 'windows', name: 'Windows', icon: faMicrosoft },
  { id: 'ubuntu', name: 'Ubuntu', icon: faUbuntu },
];

const ARCH_OPTIONS = [
  { id: 'arm64', name: 'ARM64', description: '64-bit ARM architecture' },
  { id: 'x64', name: 'Intel (x64)', description: 'Intel and AMD processors' },
];

interface Release {
  version: string;
  date: string;
  size: string;
  stable: boolean;
  prerelease: boolean;
  assets: {
    macos: boolean;
    windows: boolean;
    ubuntu: boolean;
    downloadUrl?: string;
  };
}

export default function VersionsPage() {
  const navigate = useNavigate();
  const { platform, arch } = useParams<{ platform?: string; arch?: string }>();

  // Derive the current step and selections from the URL so a page refresh
  // (e.g. on /versions/macos/arm64) stays on the same screen.
  const selectedOS = platform && OS_OPTIONS.some(os => os.id === platform) ? platform : null;
  const selectedArch = arch && ARCH_OPTIONS.some(a => a.id === arch) ? arch : null;
  const step: 'os' | 'arch' | 'versions' = selectedOS && selectedArch ? 'versions' : selectedOS ? 'arch' : 'os';

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPrereleases, setShowPrereleases] = useState(false);
  const [hypedArches, setHypedArches] = useState<Set<string>>(new Set());
  const [hypeLoading, setHypeLoading] = useState<HypeLoadingState>({});
  const [buildingVersions, setBuildingVersions] = useState<Set<string>>(new Set());
  const [failedVersions, setFailedVersions] = useState<Set<string>>(new Set());

  // Normalize version tags so "v1.1.1" and "1.1.1" compare equal.
  const normalizeVersion = (v: string) => v.replace(/^v/i, '').trim();

  // Compare two version tags numerically. Returns >0 if a is newer than b.
  const compareVersions = (a: string, b: string) => {
    const pa = normalizeVersion(a).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
    const pb = normalizeVersion(b).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  // Fetch releases from GitHub API
  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/kokofixcomputers/lumina-chat/releases');
        const data = await response.json();

        const parsedReleases: Release[] = data.map((release: any) => {
          const assets = release.assets || [];
          const macOSAsset = assets.find((asset: any) => asset.name.includes('macos'));
          const windowsAsset = assets.find((asset: any) => asset.name.includes('windows'));
          const ubuntuAsset = assets.find((asset: any) => asset.name.includes('ubuntu'));

          // Get the first asset's size for display
          const size = assets.length > 0 ? `${(assets[0].size / (1024 * 1024)).toFixed(1)} MB` : 'Unknown';

          return {
            version: release.tag_name,
            date: new Date(release.published_at).toLocaleDateString(),
            size,
            stable: !release.prerelease,
            prerelease: release.prerelease,
            assets: {
              macos: !!macOSAsset,
              windows: !!windowsAsset,
              ubuntu: !!ubuntuAsset,
              downloadUrl: macOSAsset?.browser_download_url || windowsAsset?.browser_download_url || ubuntuAsset?.browser_download_url,
            },
          };
        });

        setReleases(parsedReleases);
      } catch (error) {
        console.error('Failed to fetch releases:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReleases();
  }, []);

  // Fetch in-progress release workflow runs so we can show a "building" spinner
  // for versions that don't have assets yet but are currently being built.
  useEffect(() => {
    const fetchBuildingVersions = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/kokofixcomputers/lumina-chat/actions/workflows/265491015/runs?per_page=30');
        const data = await response.json();

        // Runs come back newest-first, so the first run we see for a given
        // version is its latest attempt (a rerun supersedes an older failure).
        const seen = new Set<string>();
        const building = new Set<string>();
        const failed = new Set<string>();
        for (const run of data.workflow_runs || []) {
          const version = run.head_branch || run.display_title;
          if (!version) continue;
          const key = normalizeVersion(version);
          if (seen.has(key)) continue;
          seen.add(key);

          if (run.status === 'in_progress' || run.status === 'queued') {
            building.add(key);
          } else if (run.status === 'completed' && run.conclusion === 'failure') {
            failed.add(key);
          }
        }
        setBuildingVersions(building);
        setFailedVersions(failed);
      } catch (error) {
        console.error('Failed to fetch workflow runs:', error);
      }
    };

    fetchBuildingVersions();
  }, []);

  // Filter releases based on prerelease toggle
  const filteredReleases = releases.filter(release => showPrereleases || !release.prerelease);

  // Load hyped arches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('hyped-arches');
    if (stored) {
      setHypedArches(new Set(JSON.parse(stored)));
    }
  }, []);

  const handleHypeClick = async (os: string, arch: string) => {
    const key = `${os}-${arch}`;
    if (hypedArches.has(key)) return;

    setHypeLoading({ ...hypeLoading, [key]: true });

    try {
      const response = await fetch('/api/hype', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ os, arch }),
      });

      if (!response.ok) {
        console.error('Failed to hype:', response.status);
        setHypeLoading({ ...hypeLoading, [key]: false });
        return;
      }

      const newHyped = new Set(hypedArches);
      newHyped.add(key);
      setHypedArches(newHyped);
      localStorage.setItem('hyped-arches', JSON.stringify([...newHyped]));
    } catch (error) {
      console.error('Failed to hype:', error);
    } finally {
      setHypeLoading({ ...hypeLoading, [key]: false });
    }
  };

  const handleOSSelect = (osId: string) => {
    navigate(`/versions/${osId}`);
  };

  const handleArchSelect = (archId: string) => {
    navigate(`/versions/${selectedOS}/${archId}`);
  };

  const handleBack = () => {
    if (step === 'arch') {
      navigate('/versions');
    } else if (step === 'versions') {
      navigate(`/versions/${selectedOS}`);
    }
  };

  const getOSName = () => OS_OPTIONS.find(os => os.id === selectedOS)?.name || '';
  const getArchName = () => ARCH_OPTIONS.find(arch => arch.id === selectedArch)?.name || '';

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => step === 'os' ? navigate('/download') : handleBack()}
            className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors mb-4"
          >
            <ChevronLeft size={20} />
            {step === 'os' ? 'Back to Download' : 'Back'}
          </button>
          <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-2">
            Choose Your Version
          </h1>
          <p className="text-lg text-[rgb(var(--muted))]">
            {step === 'os' && 'Select your operating system'}
            {step === 'arch' && `Selected: ${getOSName()} - Choose your architecture`}
            {step === 'versions' && `Selected: ${getOSName()} - ${getArchName()} - Choose a version`}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`flex-1 h-1 rounded-full ${step === 'os' || step === 'arch' || step === 'versions' ? 'bg-[rgb(var(--text))]' : 'bg-[rgb(var(--border))]'}`} />
          <div className={`flex-1 h-1 rounded-full ${step === 'arch' || step === 'versions' ? 'bg-[rgb(var(--text))]' : 'bg-[rgb(var(--border))]'}`} />
          <div className={`flex-1 h-1 rounded-full ${step === 'versions' ? 'bg-[rgb(var(--text))]' : 'bg-[rgb(var(--border))]'}`} />
        </div>

        {/* OS Selection */}
        {step === 'os' && (
          <div className="grid md:grid-cols-3 gap-4">
            {OS_OPTIONS.map((os) => (
              <button
                key={os.id}
                onClick={() => handleOSSelect(os.id)}
                className="bg-[rgb(var(--panel))] rounded-2xl p-8 border border-[rgb(var(--border))] hover:border-[rgb(var(--text))] transition-colors text-left"
              >
                <div className="mb-4">
                  <FontAwesomeIcon icon={os.icon} size="4x" className="text-[rgb(var(--text))]" />
                </div>
                <h3 className="text-xl font-semibold text-[rgb(var(--text))] mb-2">{os.name}</h3>
              </button>
            ))}
          </div>
        )}

        {/* Architecture Selection */}
        {step === 'arch' && (
          <div className="space-y-3">
            {ARCH_OPTIONS.map((arch) => {
              const isUnavailable =
                (selectedOS === 'macos' && arch.id === 'x64') ||
                (selectedOS === 'windows' && arch.id === 'arm64') ||
                (selectedOS === 'ubuntu' && arch.id === 'arm64')

              return (
                <div
                  key={arch.id}
                  className={`w-full bg-[rgb(var(--panel))] rounded-2xl p-6 border ${
                    isUnavailable
                      ? 'border-[rgb(var(--border))]'
                      : 'border-[rgb(var(--border))] hover:border-[rgb(var(--text))] transition-colors'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className={`flex-1 ${isUnavailable ? 'opacity-50' : ''}`}>
                      <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-1">{arch.name}</h3>
                      <p className="text-sm text-[rgb(var(--muted))] mb-2">{arch.description}</p>
                      {isUnavailable && (
                        <p className="text-sm text-[rgb(var(--muted))]">
                          Let us know if people actually want this by hyping this.
                        </p>
                      )}
                    </div>
                    {isUnavailable ? (
                      <button
                        onClick={() => handleHypeClick(selectedOS!, arch.id)}
                        disabled={hypedArches.has(`${selectedOS}-${arch.id}`)}
                        className={`px-4 py-2 rounded-full text-sm flex items-center gap-2 ${
                          hypedArches.has(`${selectedOS}-${arch.id}`)
                            ? 'btn-secondary cursor-default'
                            : 'btn-primary'
                        }`}
                      >
                        {hypeLoading[`${selectedOS}-${arch.id}`] ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Hype for this
                          </>
                        ) : hypedArches.has(`${selectedOS}-${arch.id}`) ? (
                          'Hyped'
                        ) : (
                          'Hype for this'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchSelect(arch.id)}
                        className="btn-secondary px-4 py-2 rounded-full text-sm"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Versions List */}
        {step === 'versions' && (
          <div className="space-y-3">
            {/* Prerelease Toggle */}
            <div className="bg-[rgb(var(--panel))] rounded-2xl p-4 border border-[rgb(var(--border))]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrereleases}
                      onChange={(e) => setShowPrereleases(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[rgb(var(--border))] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[rgb(var(--text))]" />
                  </label>
                  <span className="text-[rgb(var(--text))] font-medium">Show nightly binaries</span>
                </div>
                <div className="flex items-center gap-2 text-[rgb(var(--muted))] text-sm">
                  <Info size={16} />
                  <span>While these should work, they are here for a reason and not in release. Many features could be untested.</span>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-[rgb(var(--text))]" size={32} />
              </div>
            ) : filteredReleases.length === 0 ? (
              <div className="text-center py-12 text-[rgb(var(--muted))]">
                No releases found
              </div>
            ) : (
              filteredReleases.map((release) => {
                const hasBuild = selectedOS && release.assets[selectedOS as keyof typeof release.assets];
                const isBuilding = !hasBuild && buildingVersions.has(normalizeVersion(release.version));
                const isFailed = !hasBuild && !isBuilding && failedVersions.has(normalizeVersion(release.version));
                // Is there a newer release that actually has a build for this OS?
                const hasNewerBuild = isFailed && filteredReleases.some((r) =>
                  selectedOS &&
                  r.assets[selectedOS as keyof typeof r.assets] &&
                  compareVersions(r.version, release.version) > 0
                );
                return (
                  <div
                    key={release.version}
                    className={`bg-[rgb(var(--panel))] rounded-2xl p-6 border ${
                      release.prerelease
                        ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                        : 'border-[rgb(var(--border))]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-[rgb(var(--text))]">{release.version}</h3>
                          {release.stable && (
                            <span className="px-2 py-1 bg-[rgb(var(--text))] text-[rgb(var(--bg))] text-xs rounded-full">
                              Stable
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[rgb(var(--muted))]">
                          Released: {release.date} • Size: {release.size}
                        </p>
                        {!hasBuild && (
                          <p className="text-sm mt-2 text-[rgb(var(--muted))]">
                            {isBuilding
                              ? 'This build is currently being built. Check back in a few minutes.'
                              : isFailed
                                ? hasNewerBuild
                                  ? 'This build failed. Please download a newer version instead.'
                                  : 'This build failed. Our team is working on it — please check back later.'
                                : 'This build is unavailable.'}
                          </p>
                        )}
                      </div>
                      {hasBuild ? (
                        <button
                          onClick={() => navigate(`/install?platform=${selectedOS}&version=${release.version}`)}
                          className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full"
                        >
                          <Download size={18} />
                          Download
                        </button>
                      ) : isBuilding ? (
                        <button
                          disabled
                          className="btn-secondary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full cursor-default"
                        >
                          <Loader2 size={18} className="animate-spin" />
                          Building
                        </button>
                      ) : isFailed ? (
                        <button
                          disabled
                          className="btn-secondary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full opacity-50 cursor-not-allowed"
                        >
                          <AlertTriangle size={18} />
                          {hasNewerBuild ? 'Use newer version' : 'Build failed'}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="btn-secondary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full opacity-50 cursor-not-allowed"
                        >
                          <Download size={18} />
                          Unavailable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
