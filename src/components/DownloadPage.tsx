import { Download, Zap, Shield, Star, ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DownloadPage() {
  const navigate = useNavigate();
  // Detect platform
  const getPlatform = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    if (platform.includes('mac') || userAgent.includes('mac')) return 'macOS';
    if (platform.includes('win') || userAgent.includes('win')) return 'Windows';
    if (platform.includes('linux') || userAgent.includes('linux')) return 'Linux';
    return 'macOS'; // Default to macOS
  };

  const platform = getPlatform();

  return (
    <div className="min-h-screen bg-[rgb(var(--bg))]">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header with CTA */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgb(var(--text))] mb-6">
            <Download size={32} className="text-[rgb(var(--bg))]" />
          </div>
          <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-4">
            Download Lumina Chat
          </h1>
          <p className="text-lg text-[rgb(var(--muted))] max-w-2xl mx-auto mb-8">
            Experience the full power of AI conversations with our desktop application.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate(`/install?platform=${platform.toLowerCase()}`)}
              className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full"
            >
              <Download size={18} />
              Download for {platform}
            </button>
            <button
              onClick={() => navigate('/versions')}
              className="btn-secondary inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full"
            >
              <ArrowRight size={18} />
              View All Platforms
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
            <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
              <Zap className="text-[rgb(var(--bg))]" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-2">Lightning Fast</h3>
            <p className="text-sm text-[rgb(var(--muted))]">
              Native performance with no browser overhead. Instant startup and smooth interactions.
            </p>
          </div>

          <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
            <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
              <Shield className="text-[rgb(var(--bg))]" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-2">Enhanced Security</h3>
            <p className="text-sm text-[rgb(var(--muted))]">
              Your conversations stay on your device. End-to-end encryption and local storage.
            </p>
          </div>

          <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
            <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
              <Star className="text-[rgb(var(--bg))]" size={20} />
            </div>
            <h3 className="text-lg font-semibold text-[rgb(var(--text))] mb-2">Premium Features</h3>
            <p className="text-sm text-[rgb(var(--muted))]">
              Advanced AI models, file uploads, image generation, and much more.
            </p>
          </div>
        </div>

        {/* Feature List */}
        <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
          <h2 className="text-xl font-semibold text-[rgb(var(--text))] mb-4">
            Why Choose Desktop?
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              'Local conversation storage',
              'System notifications',
              'Keyboard shortcuts',
              'Deep linking support',
              'Offline mode',
              'Custom themes',
              'File drag & drop',
              'Multi-window support',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <Check className="text-[rgb(var(--text))]" size={16} />
                <span className="text-sm text-[rgb(var(--text))]">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
