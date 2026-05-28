import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download,
  FolderOpen,
  PackageOpen,
  AppWindow,
  TerminalSquare,
  Sparkles,
  ArrowRight,
  MonitorDown,
} from 'lucide-react';

type Platform = 'macos' | 'windows' | 'ubuntu';

const INSTALLATION_STEPS: Record<
  Platform,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }[]
> = {
  macos: [
    {
      title: 'Open the zip file',
      description: 'Find Lumina-Chat-macos-latest.zip in your Downloads folder.',
      icon: FolderOpen,
    },
    {
      title: 'Open the app package',
      description: 'Unzip it, then open the .dmg file.',
      icon: PackageOpen,
    },
    {
      title: 'Move to Applications',
      description: 'Drag Lumina Chat into your Applications folder.',
      icon: AppWindow,
    },
    {
      title: 'Launch Lumina Chat',
      description: 'Open the app from Applications when the copy is complete.',
      icon: MonitorDown,
    },
  ],
  windows: [
    {
      title: 'Open the zip file',
      description: 'Find Lumina-Chat-windows-latest.zip in your Downloads folder.',
      icon: FolderOpen,
    },
    {
      title: 'Run the installer',
      description: 'Unzip the folder and open the .exe installer.',
      icon: Download,
    },
    {
      title: 'Complete setup',
      description: 'Follow the installation wizard to finish.',
      icon: Sparkles,
    },
    {
      title: 'Launch the app',
      description: 'Open Lumina Chat from the Start Menu.',
      icon: AppWindow,
    },
  ],
  ubuntu: [
    {
      title: 'Open the zip file',
      description: 'Find Lumina-Chat-ubuntu-latest.zip in your Downloads folder.',
      icon: FolderOpen,
    },
    {
      title: 'Extract the files',
      description: 'Unzip the archive and open Terminal in the extracted folder.',
      icon: PackageOpen,
    },
    {
      title: 'Make it executable',
      description: 'Run chmod +x Lumina-Chat.',
      icon: TerminalSquare,
    },
    {
      title: 'Start the app',
      description: 'Run ./Lumina-Chat to launch it.',
      icon: AppWindow,
    },
  ],
};

export default function InstallationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const platform = (searchParams.get('platform') || 'macos') as Platform;
  const version = searchParams.get('version');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const steps = INSTALLATION_STEPS[platform];

  useEffect(() => {
    const getDownloadUrl = async () => {
      try {
        const url = version
          ? `https://api.github.com/repos/kokofixcomputers/lumina-chat/releases/tags/${version}`
          : 'https://api.github.com/repos/kokofixcomputers/lumina-chat/releases/latest';
        
        const response = await fetch(url);
        const data = await response.json();

        const assets = data.assets || [];
        const platformAsset = assets.find((asset: any) =>
          asset.name.includes(
            platform === 'macos'
              ? 'macos'
              : platform === 'windows'
              ? 'windows'
              : 'ubuntu'
          )
        );

        if (platformAsset) {
          setDownloadUrl(platformAsset.browser_download_url);

          const link = document.createElement('a');
          link.href = platformAsset.browser_download_url;
          link.download = platformAsset.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (error) {
        console.error('Failed to get download URL:', error);
      }
    };

    getDownloadUrl();
  }, [platform, version]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#cfe4ea] via-[#deedf0] to-[#f3f7f8] dark:from-[#0c1114] dark:via-[#0f1b20] dark:to-[#0c1114] px-6 py-10">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-slate-900 shadow-xl ring-1 ring-white/15">
          <Download className="h-9 w-9 text-cyan-300" />
        </div>

        <h1 className="max-w-2xl text-center text-4xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          You're almost there. Let's get you set up.
        </h1>

        <p className="mt-4 max-w-2xl text-center text-base text-slate-600 dark:text-slate-300 sm:text-lg">
          Your download should start automatically. If it doesn't,{' '}
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="font-medium text-slate-900 underline decoration-slate-400 underline-offset-4 hover:decoration-slate-900 dark:text-white"
            >
              download Lumina Chat manually
            </a>
          ) : (
            <span className="font-medium text-slate-900 underline decoration-slate-400 underline-offset-4 dark:text-white">
              download Lumina Chat manually
            </span>
          )}
          .
        </p>

        <div className="mt-12 grid w-full max-w-5xl gap-5 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md transition-transform duration-200 hover:-translate-y-1 dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    <span className="text-sm font-semibold">{index + 1}</span>
                  </div>
                  <Icon className="h-6 w-6 text-cyan-700 dark:text-cyan-300" />
                </div>

                <h2 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex items-center gap-3">
          <button
            onClick={() => navigate('/download')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Back to download
          </button>
        </div>
      </div>
    </div>
  );
}