import { useState, useEffect } from 'react';
import { 
  Sparkles, MessageSquare, Zap, Shield, ArrowRight, ArrowLeft, Check, 
  Plus, Settings, Globe, Key, Server, Star, ArrowBigRight
} from 'lucide-react';
import { integratedProviders, type IntegratedProviderTemplate } from '../data/integratedProviders';
import type { ModelProvider } from '../types';

interface OnboardingScreenProps {
  onGetStarted: () => void;
  onAddProvider: (provider: ModelProvider) => void;
  onAddIntegratedProvider: (template: IntegratedProviderTemplate) => void;
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

type OnboardingStep = 'welcome' | 'providers' | 'done';

export default function OnboardingScreen({ 
  onGetStarted, 
  onAddProvider, 
  onAddIntegratedProvider 
}: OnboardingScreenProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [customProviderUrl, setCustomProviderUrl] = useState('');
  const [customProviderName, setCustomProviderName] = useState('');
  const [customProviderKey, setCustomProviderKey] = useState('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);

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

  const handleNext = () => {
    if (currentStep === 'welcome') {
      setCurrentStep('providers');
    } else if (currentStep === 'providers') {
      setCurrentStep('done');
    } else if (currentStep === 'done') {
      onGetStarted();
    }
  };

  const handleBack = () => {
    if (currentStep === 'providers') {
      setCurrentStep('welcome');
    } else if (currentStep === 'done') {
      setCurrentStep('providers');
    }
  };

  const handleSkip = () => {
    setCurrentStep('done');
  };

  const handleProviderSelect = async (providerId: string) => {
    setSelectedProvider(providerId);
    const template = integratedProviders.find(p => p.id === providerId);
    if (template) {
      onAddIntegratedProvider(template);
    }
  };

  const handleAddCustomProvider = async () => {
    if (!customProviderName || !customProviderUrl) return;
    
    setIsAddingProvider(true);
    const newProvider: ModelProvider = {
      id: `custom_${Date.now()}`,
      name: customProviderName,
      baseUrl: customProviderUrl,
      apiKey: customProviderKey,
      models: [{ 
        id: 'custom-model', 
        name: 'Custom Model', 
        contextLength: 4096, 
        supportsImages: false, 
        supportsStreaming: true 
      }],
      enabled: true
    };
    
    onAddProvider(newProvider);
    setIsAddingProvider(false);
    setCustomProviderName('');
    setCustomProviderUrl('');
    setCustomProviderKey('');
    setSelectedProvider('custom');
  };

  const renderStepIndicator = () => {
    const steps = ['welcome', 'providers', 'done'];
    const currentIndex = steps.indexOf(currentStep);
    
    return (
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index <= currentIndex 
                  ? 'bg-[rgb(var(--accent))]' 
                  : 'bg-[rgb(var(--border))]'
              }`}
            />
            {index < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 transition-all duration-300 ${
                  index < currentIndex 
                    ? 'bg-[rgb(var(--accent))]' 
                    : 'bg-[rgb(var(--border))]'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderWelcomeStep = () => (
    <div className="text-center space-y-6 md:space-y-8">
      <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 mb-4">
        <Sparkles size={40} className="text-[rgb(var(--text))]" />
      </div>
      
      <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-[rgb(var(--text))]">
        Welcome to Lumina Chat
      </h1>
      
      <p className={`text-lg md:text-xl text-[rgb(var(--muted))] max-w-2xl mx-auto transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {TAGLINES[taglineIndex]}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-6">
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.05s' }}>
          <MessageSquare size={24} className="text-[rgb(var(--text))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Multi-Provider</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">Connect to OpenAI, Anthropic, and more</p>
        </div>
        
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.1s' }}>
          <Zap size={24} className="text-[rgb(var(--text))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Function Calling</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">Tools, search, and image generation</p>
        </div>
        
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))] animate-slide-in-up" style={{ animationDelay: '0.15s' }}>
          <Shield size={24} className="text-[rgb(var(--text))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Privacy First</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">All data stored locally on your device</p>
        </div>
      </div>
    </div>
  );

  const renderProvidersStep = () => (
    <div className="text-center space-y-6 md:space-y-8 max-w-4xl mx-auto w-full">
      <div className="space-y-4">
        <h2 className="text-2xl md:text-4xl font-bold text-[rgb(var(--text))]">
          Choose Your AI Provider
        </h2>
        <p className="text-base md:text-lg text-[rgb(var(--muted))] max-w-2xl mx-auto">
          Select an integrated provider or set up a custom one. You can always add more later in settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integratedProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => handleProviderSelect(provider.id)}
            className={`p-4 rounded-2xl border transition-all duration-200 text-left ${
              selectedProvider === provider.id
                ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
                : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50 bg-[rgb(var(--bg))]'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              {provider.id === 'openai' && <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">O</div>}
              {provider.id === 'anthropic' && <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">A</div>}
              {provider.id === 'ollama' && <Server size={20} className="text-[rgb(var(--text))]" />}
              {provider.id === '1minrelay' && <Globe size={20} className="text-[rgb(var(--text))]" />}
              {provider.id === 'mistral' && <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-xs font-bold">M</div>}
              {provider.id === 'pollinations' && <Star size={20} className="text-[rgb(var(--text))]" />}
              <div>
                <h3 className="font-semibold text-[rgb(var(--text))]">{provider.name}</h3>
                <p className="text-xs text-[rgb(var(--muted))]">{provider.description}</p>
              </div>
            </div>
            {selectedProvider === provider.id && (
              <Check size={16} className="text-[rgb(var(--accent))]" />
            )}
          </button>
        ))}

        <button
          onClick={() => setSelectedProvider('custom')}
          className={`p-4 rounded-2xl border transition-all duration-200 text-left ${
            selectedProvider === 'custom'
              ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10'
              : 'border-[rgb(var(--border))] hover:border-[rgb(var(--accent))]/50 bg-[rgb(var(--bg))]'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Settings size={20} className="text-[rgb(var(--text))]" />
            <div>
              <h3 className="font-semibold text-[rgb(var(--text))]">Custom Provider</h3>
              <p className="text-xs text-[rgb(var(--muted))]">Add your own API endpoint</p>
            </div>
          </div>
          {selectedProvider === 'custom' && (
            <Check size={16} className="text-[rgb(var(--accent))]" />
          )}
        </button>
      </div>

      {selectedProvider === 'custom' && (
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))] space-y-4 text-left">
          <h3 className="font-semibold text-[rgb(var(--text))] flex items-center gap-2">
            <Settings size={18} />
            Custom Provider Setup
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                Provider Name
              </label>
              <input
                type="text"
                value={customProviderName}
                onChange={(e) => setCustomProviderName(e.target.value)}
                placeholder="e.g., My Custom API"
                className="w-full px-3 py-2 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--accent))]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                API Base URL
              </label>
              <input
                type="url"
                value={customProviderUrl}
                onChange={(e) => setCustomProviderUrl(e.target.value)}
                placeholder="e.g., https://api.example.com/v1"
                className="w-full px-3 py-2 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--accent))]"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
              API Key (optional)
            </label>
            <input
              type="password"
              value={customProviderKey}
              onChange={(e) => setCustomProviderKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-3 py-2 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--accent))]"
            />
          </div>
          
          <button
            onClick={handleAddCustomProvider}
            disabled={!customProviderName || !customProviderUrl || isAddingProvider}
            className="px-4 py-2 bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {isAddingProvider ? 'Adding...' : 'Add Custom Provider'}
          </button>
        </div>
      )}
    </div>
  );

  const renderDoneStep = () => (
    <div className="text-center space-y-6 md:space-y-8">
      <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
        <Check size={40} className="text-green-600 dark:text-green-400" />
      </div>
      
      <h2 className="text-3xl md:text-5xl font-bold text-[rgb(var(--text))]">
        You're All Set!
      </h2>
      
      <p className="text-lg md:text-xl text-[rgb(var(--muted))] max-w-2xl mx-auto">
        Lumina Chat is ready to use. Start chatting with AI, explore tools, and customize your experience in settings.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-6">
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))]">
          <MessageSquare size={24} className="text-[rgb(var(--accent))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Start Chatting</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">Begin your first conversation</p>
        </div>
        
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))]">
          <Zap size={24} className="text-[rgb(var(--accent))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Explore Tools</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">Use search, images, and more</p>
        </div>
        
        <div className="bg-[rgb(var(--bg))] rounded-2xl p-6 border border-[rgb(var(--border))]">
          <Settings size={24} className="text-[rgb(var(--accent))] mb-3 mx-auto" />
          <p className="text-sm md:text-base text-[rgb(var(--text))] font-medium">Customize</p>
          <p className="text-sm text-[rgb(var(--muted))] mt-2">Add providers and adjust settings</p>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcomeStep();
      case 'providers':
        return renderProvidersStep();
      case 'done':
        return renderDoneStep();
      default:
        return renderWelcomeStep();
    }
  };

  const getButtonText = () => {
    switch (currentStep) {
      case 'welcome':
        return 'Continue';
      case 'providers':
        return selectedProvider ? 'Continue' : 'Skip';
      case 'done':
        return "Let's Start Chatting!";
      default:
        return 'Continue';
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 dark:from-[rgb(14,14,16)] dark:via-blue-950/10 dark:to-purple-950/5 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="w-full max-w-6xl">
        {renderStepIndicator()}
        
        <div className="bg-[rgb(var(--panel))] rounded-3xl p-6 md:p-12 shadow-[0_8px_40px_rgba(0,0,0,0.12)] border border-[rgb(var(--border))] animate-scale-in max-h-[85vh] overflow-y-auto">
          {renderContent()}
          
          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[rgb(var(--border))]">
            <div>
              {currentStep !== 'welcome' && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-4 py-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {currentStep === 'providers' && (
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
                >
                  Skip
                </button>
              )}
              
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))] rounded-full font-semibold hover:opacity-90 transition-all shadow-[0_2px_16px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
              >
                {getButtonText()}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
