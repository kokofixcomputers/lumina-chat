import { Sparkles, MessageSquare, Zap, Shield } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export default function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 dark:from-[rgb(14,14,16)] dark:via-blue-950/10 dark:to-purple-950/5 flex items-center justify-center p-4 z-50">
      <div className="max-w-2xl w-full bg-[rgb(var(--panel))] rounded-3xl p-8 md:p-12 shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[rgb(var(--border))]">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-4">
            <Sparkles size={40} className="text-[rgb(var(--text))]" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-[rgb(var(--text))]">
            Welcome to Lumina Chat
          </h1>
          
          <p className="text-lg text-[rgb(var(--muted))] max-w-xl mx-auto">
            Your powerful AI assistant that brings together multiple providers in one elegant interface.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))]">
              <MessageSquare size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Multi-Provider</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">Connect to OpenAI, Anthropic, and more</p>
            </div>
            
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))]">
              <Zap size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Function Calling</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">Tools, search, and image generation</p>
            </div>
            
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))]">
              <Shield size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Privacy First</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">All data stored locally on your device</p>
            </div>
          </div>

          <button
            onClick={onGetStarted}
            className="mt-8 px-8 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-full font-semibold text-lg hover:opacity-90 transition-all shadow-[0_2px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
