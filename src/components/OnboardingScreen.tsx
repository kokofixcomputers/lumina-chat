import { useState, useEffect } from 'react';
import {
  Sparkles, MessageSquare, Zap, Shield, ArrowRight, ArrowLeft, Check,
  Plus, Settings, Globe, Key, Server, Star
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
  const [visibleStep, setVisibleStep] = useState<OnboardingStep>('welcome');
  const [stepVisible, setStepVisible] = useState(true);
  const [screenVisible, setScreenVisible] = useState(true);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
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

  const transitionTo = (next: OnboardingStep) => {
    setStepVisible(false);
    setTimeout(() => {
      setCurrentStep(next);
      setVisibleStep(next);
      setStepVisible(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 200);
  };

  const handleNext = () => {
    if (currentStep === 'welcome') {
      transitionTo('providers');
    } else if (currentStep === 'providers') {
      transitionTo('done');
    } else if (currentStep === 'done') {
      setScreenVisible(false);
      setTimeout(() => onGetStarted(), 300);
    }
  };

  const handleBack = () => {
    if (currentStep === 'providers') {
      transitionTo('welcome');
    } else if (currentStep === 'done') {
      transitionTo('providers');
    }
  };

  const handleSkip = () => {
    transitionTo('done');
  };

  const handleProviderSelect = async (providerId: string) => {
    setSelectedProvider(providerId);
  };

  const handleAddProviderWithKey = async (providerId: string) => {
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

  const steps: OnboardingStep[] = ['welcome', 'providers', 'done'];
  const currentIndex = steps.indexOf(currentStep);

  const getButtonText = () => {
    switch (currentStep) {
      case 'welcome': return 'Continue';
      case 'providers': return selectedProvider ? 'Continue' : 'Skip';
      case 'done': return "Let's Start Chatting!";
      default: return 'Continue';
    }
  };

  const selectedIntegratedProvider = integratedProviders.find(p => p.id === selectedProvider);

  return (
    <div
      className="fixed inset-0 z-[60] bg-[rgb(var(--bg))] overflow-y-auto"
      style={{ transition: 'opacity 300ms ease', opacity: screenVisible ? 1 : 0 }}
    >
      <div className="max-w-4xl mx-auto px-4 py-12 pb-16">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center flex-1">
              <div className={`flex-1 h-1 rounded-full transition-all duration-300 ${index <= currentIndex ? 'bg-[rgb(var(--text))]' : 'bg-[rgb(var(--border))]'}`} />
            </div>
          ))}
        </div>

        {/* Step content with fade+slide transition */}
        <div
          className="transition-all duration-200"
          style={{
            opacity: stepVisible ? 1 : 0,
            transform: stepVisible ? 'translateY(0)' : 'translateY(10px)',
          }}
        >

        {/* Welcome step */}
        {visibleStep === 'welcome' && (
          <div className="space-y-10">
            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgb(var(--text))] mb-6">
                <Sparkles size={28} className="text-[rgb(var(--bg))]" />
              </div>
              <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-3">
                Welcome to Lumina Chat
              </h1>
              <p className={`text-lg text-[rgb(var(--muted))] transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
                {TAGLINES[taglineIndex]}
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <MessageSquare className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Multi-Provider</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Connect to OpenAI, Anthropic, and more</p>
              </div>

              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <Zap className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Function Calling</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Tools, search, and image generation</p>
              </div>

              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <Shield className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Privacy First</h3>
                <p className="text-sm text-[rgb(var(--muted))]">All data stored locally on your device</p>
              </div>
            </div>
          </div>
        )}

        {/* Providers step */}
        {visibleStep === 'providers' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-3">
                Choose Your AI Provider
              </h1>
              <p className="text-lg text-[rgb(var(--muted))]">
                Select an integrated provider or set up a custom one. You can always add more later in settings.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {integratedProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleProviderSelect(provider.id)}
                  className={`p-4 rounded-2xl border transition-all duration-200 text-left ${
                    selectedProvider === provider.id
                      ? 'border-[rgb(var(--text))] bg-[rgb(var(--panel))]'
                      : 'border-[rgb(var(--border))] hover:border-[rgb(var(--text))]/50 bg-[rgb(var(--panel))]'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    {provider.id === 'openai' && <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold shrink-0">O</div>}
                    {provider.id === 'anthropic' && <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">A</div>}
                    {provider.id === 'ollama' && <div className="w-8 h-8 rounded-full bg-[rgb(var(--border))] flex items-center justify-center shrink-0"><Server size={16} className="text-[rgb(var(--text))]" /></div>}
                    {provider.id === '1minrelay' && <div className="w-8 h-8 rounded-full bg-[rgb(var(--border))] flex items-center justify-center shrink-0"><Globe size={16} className="text-[rgb(var(--text))]" /></div>}
                    {provider.id === 'mistral' && <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-xs font-bold shrink-0">M</div>}
                    {provider.id === 'pollinations' && <div className="w-8 h-8 rounded-full bg-[rgb(var(--border))] flex items-center justify-center shrink-0"><Star size={16} className="text-[rgb(var(--text))]" /></div>}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[rgb(var(--text))] text-sm">{provider.name}</h3>
                      <p className="text-xs text-[rgb(var(--muted))] truncate">{provider.description}</p>
                    </div>
                    {selectedProvider === provider.id && (
                      <Check size={16} className="text-[rgb(var(--text))] ml-auto shrink-0" />
                    )}
                  </div>
                </button>
              ))}

              <button
                onClick={() => setSelectedProvider('custom')}
                className={`p-4 rounded-2xl border transition-all duration-200 text-left ${
                  selectedProvider === 'custom'
                    ? 'border-[rgb(var(--text))] bg-[rgb(var(--panel))]'
                    : 'border-[rgb(var(--border))] hover:border-[rgb(var(--text))]/50 bg-[rgb(var(--panel))]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[rgb(var(--border))] flex items-center justify-center shrink-0">
                    <Settings size={16} className="text-[rgb(var(--text))]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[rgb(var(--text))] text-sm">Custom Provider</h3>
                    <p className="text-xs text-[rgb(var(--muted))]">Add your own API endpoint</p>
                  </div>
                  {selectedProvider === 'custom' && (
                    <Check size={16} className="text-[rgb(var(--text))] ml-auto shrink-0" />
                  )}
                </div>
              </button>
            </div>

            {/* API Key for integrated provider */}
            {selectedIntegratedProvider && selectedIntegratedProvider.requireAuth && (
              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))] space-y-4">
                <h3 className="font-semibold text-[rgb(var(--text))] flex items-center gap-2">
                  <Key size={18} />
                  {selectedIntegratedProvider.name} API Key
                </h3>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={providerApiKeys[selectedProvider!] || ''}
                    onChange={(e) => setProviderApiKeys(prev => ({ ...prev, [selectedProvider!]: e.target.value }))}
                    placeholder={`Enter your ${selectedIntegratedProvider.name} API key`}
                    className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--text))]"
                  />
                  <p className="text-xs text-[rgb(var(--muted))] mt-1">You can also add this later in settings</p>
                </div>
                <button
                  onClick={() => handleAddProviderWithKey(selectedProvider!)}
                  className="btn-primary px-4 py-2 rounded-full text-sm"
                >
                  Add {selectedIntegratedProvider.name}
                </button>
              </div>
            )}

            {/* No auth required */}
            {selectedIntegratedProvider && !selectedIntegratedProvider.requireAuth && (
              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))] space-y-4">
                <h3 className="font-semibold text-[rgb(var(--text))] flex items-center gap-2">
                  <Server size={18} />
                  {selectedIntegratedProvider.name} Setup
                </h3>
                <p className="text-sm text-[rgb(var(--muted))]">
                  {selectedIntegratedProvider.name} doesn't require an API key. Make sure the service is running at the default URL.
                </p>
                <button
                  onClick={() => handleAddProviderWithKey(selectedProvider!)}
                  className="btn-primary px-4 py-2 rounded-full text-sm"
                >
                  Add {selectedIntegratedProvider.name}
                </button>
              </div>
            )}

            {/* Custom provider setup */}
            {selectedProvider === 'custom' && (
              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))] space-y-4">
                <h3 className="font-semibold text-[rgb(var(--text))] flex items-center gap-2">
                  <Settings size={18} />
                  Custom Provider Setup
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">Provider Name</label>
                    <input
                      type="text"
                      value={customProviderName}
                      onChange={(e) => setCustomProviderName(e.target.value)}
                      placeholder="e.g., My Custom API"
                      className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--text))]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">API Base URL</label>
                    <input
                      type="url"
                      value={customProviderUrl}
                      onChange={(e) => setCustomProviderUrl(e.target.value)}
                      placeholder="e.g., https://api.example.com/v1"
                      className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--text))]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[rgb(var(--text))] mb-2">API Key (optional)</label>
                  <input
                    type="password"
                    value={customProviderKey}
                    onChange={(e) => setCustomProviderKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full px-3 py-2 bg-[rgb(var(--bg))] border border-[rgb(var(--border))] rounded-lg text-[rgb(var(--text))] placeholder:text-[rgb(var(--muted))] focus:outline-none focus:border-[rgb(var(--text))]"
                  />
                </div>
                <button
                  onClick={handleAddCustomProvider}
                  disabled={!customProviderName || !customProviderUrl || isAddingProvider}
                  className="btn-primary px-4 py-2 rounded-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAddingProvider ? 'Adding...' : 'Add Custom Provider'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Done step */}
        {visibleStep === 'done' && (
          <div className="space-y-10">
            <div>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgb(var(--text))] mb-6">
                <Check size={28} className="text-[rgb(var(--bg))]" />
              </div>
              <h1 className="text-4xl font-bold text-[rgb(var(--text))] mb-3">
                You're All Set!
              </h1>
              <p className="text-lg text-[rgb(var(--muted))]">
                Lumina Chat is ready to use. Start chatting with AI, explore tools, and customize your experience in settings.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <MessageSquare className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Start Chatting</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Begin your first conversation</p>
              </div>

              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <Zap className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Explore Tools</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Use search, images, and more</p>
              </div>

              <div className="bg-[rgb(var(--panel))] rounded-2xl p-6 border border-[rgb(var(--border))]">
                <div className="w-10 h-10 rounded-full bg-[rgb(var(--text))] flex items-center justify-center mb-3">
                  <Settings className="text-[rgb(var(--bg))]" size={20} />
                </div>
                <h3 className="font-semibold text-[rgb(var(--text))] mb-1">Customize</h3>
                <p className="text-sm text-[rgb(var(--muted))]">Add providers and adjust settings</p>
              </div>
            </div>
          </div>
        )}

        </div>{/* end transition wrapper */}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-[rgb(var(--border))]">
          <div>
            {currentStep !== 'welcome' && (
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
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
                className="text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors text-sm"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold"
            >
              {getButtonText()}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
