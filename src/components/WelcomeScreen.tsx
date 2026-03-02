import { Sparkles, MessageSquare, Zap, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

const TAGLINES = [
  'Light up every conversation.',
  'Where curiosity finds its answers.',
  'Think brighter. Chat smarter.',
  'Your ideas, illuminated.',
  'AI that gets you.',
  'Clarity in every conversation.',
  'The future of chat, brilliantly simple.',
  'Smarter conversations start here.',
  'Powered by intelligence. Built for you.',
  'Chat beyond limits.',
  'Brilliant answers, instantly.',
  'Where every question finds its light.',
  'Where Knowledge meets Intelligence.',
  'Where Knowledge begins.'
];


export default function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTaglineIndex((prev) => (prev + 1) % TAGLINES.length);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 dark:from-[rgb(14,14,16)] dark:via-blue-950/10 dark:to-purple-950/5 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="max-w-2xl w-full bg-[rgb(var(--panel))] rounded-3xl p-8 md:p-12 shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[rgb(var(--border))] animate-scale-in">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-4">
            <Sparkles size={40} className="text-[rgb(var(--text))]" />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-[rgb(var(--text))]">
            Welcome to Lumina Chat
          </h1>
          
          <p className={`text-lg text-[rgb(var(--muted))] max-w-xl mx-auto transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
            {TAGLINES[taglineIndex]}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
              <MessageSquare size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Multi-Provider</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">Connect to OpenAI, Anthropic, and more</p>
            </div>
            
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
              <Zap size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Function Calling</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">Tools, search, and image generation</p>
            </div>
            
            <div className="bg-[rgb(var(--bg))] rounded-2xl p-4 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.15s' }}>
              <Shield size={24} className="text-[rgb(var(--text))] mb-2 mx-auto" />
              <p className="text-sm text-[rgb(var(--text))] font-medium">Privacy First</p>
              <p className="text-xs text-[rgb(var(--muted))] mt-1">All data stored locally on your device</p>
            </div>
          </div>

          <button
            onClick={onGetStarted}
            className="mt-8 px-8 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-full font-semibold text-lg hover:opacity-90 transition-all shadow-[0_2px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
          >
            Let's Go!
          </button>
        </div>
      </div>
    </div>
  );
}
