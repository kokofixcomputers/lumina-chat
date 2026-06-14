import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faApple, faMicrosoft, faUbuntu } from '@fortawesome/free-brands-svg-icons';
import { ChevronLeft, Loader2, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const OS_OPTIONS = [
  { id: 'macos', name: 'macOS', icon: faApple },
  { id: 'windows', name: 'Windows', icon: faMicrosoft },
  { id: 'ubuntu', name: 'Ubuntu', icon: faUbuntu },
];

const ARCH_OPTIONS = [
  { id: 'universal', name: 'Universal' },
  { id: 'arm64', name: 'ARM64' },
  { id: 'x64', name: 'Intel (x64)' },
];

interface Vote {
  os: string;
  arch: string;
  count: number;
}

export default function HypePage() {
  const navigate = useNavigate();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVotes = async () => {
      try {
        const response = await fetch('/api/hype');
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = await response.json();
        setVotes(data.votes || []);
      } catch (err) {
        console.error('Failed to fetch hype counts:', err);
        setError('Failed to load hype counts.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVotes();
  }, []);

  const getCount = (os: string, arch: string) =>
    votes.find((v) => v.os === os && v.arch === arch)?.count || 0;

  const getOSTotal = (os: string) =>
    votes.filter((v) => v.os === os).reduce((sum, v) => sum + v.count, 0);

  const grandTotal = votes.reduce((sum, v) => sum + v.count, 0);

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/download')}
            className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors mb-4"
          >
            <ChevronLeft size={20} />
            Back to Download
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Flame size={32} className="text-orange-500" />
            <h1 className="text-4xl font-bold text-[rgb(var(--text))]">Hype Tracker</h1>
          </div>
          <p className="text-lg text-[rgb(var(--muted))]">
            How many people have hyped each platform and architecture
            {!isLoading && !error && (
              <span className="text-[rgb(var(--text))] font-medium"> · {grandTotal} total</span>
            )}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-[rgb(var(--text))]" size={32} />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-[rgb(var(--muted))]">{error}</div>
        ) : (
          <div className="space-y-4">
            {OS_OPTIONS.map((os) => (
              <div
                key={os.id}
                className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={os.icon} size="2x" className="text-[rgb(var(--text))]" />
                    <h2 className="text-xl font-semibold text-[rgb(var(--text))]">{os.name}</h2>
                  </div>
                  <div className="flex items-center gap-2 text-[rgb(var(--muted))]">
                    <Flame size={16} className="text-orange-500" />
                    <span className="text-sm font-medium">{getOSTotal(os.id)} total</span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {ARCH_OPTIONS.map((arch) => {
                    const count = getCount(os.id, arch.id);
                    return (
                      <div
                        key={arch.id}
                        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--bg))] p-4"
                      >
                        <p className="text-sm text-[rgb(var(--muted))] mb-1">{arch.name}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-[rgb(var(--text))]">{count}</span>
                          <span className="text-xs text-[rgb(var(--muted))]">
                            {count === 1 ? 'hype' : 'hypes'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
