import React, { useState, useEffect } from 'react';
import { Database, Settings as SettingsIcon, Eye } from 'lucide-react';
import { TAGLINES } from './shared';
import { tauriUtils } from '../../utils/tauri';

interface AboutTabProps {
  taglineIndex: number;
  fade: boolean;
}

export default function AboutTab({ taglineIndex, fade }: AboutTabProps) {
  const commitSha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;
  const shortSha = commitSha?.slice(0, 7);
  
  // Get Tauri version if running in Tauri
  const [tauriVersion, setTauriVersion] = useState<string>('');
  
  React.useEffect(() => {
    const checkVersion = async () => {
      const version = await tauriUtils.getVersion();
      if (version) {
        setTauriVersion(version);
      }
    };
    
    checkVersion();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-4xl mx-auto">
      <div className="text-center space-y-6">
        <div className="w-full aspect-[1456/720] bg-gradient-to-br from-gray-100 via-blue-50/40 to-purple-50/30 dark:from-gray-800 dark:via-blue-950/20 dark:to-purple-950/10 rounded-2xl shadow-lg overflow-hidden border border-[rgb(var(--border))]">
          <img
            src="/banner.png"
            alt="Lumina Chat Banner"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-[rgb(var(--text))]">
            Lumina Chat
          </h1>
          <div className="h-7 flex items-center justify-center">
            <p className={`text-lg text-[rgb(var(--muted))] transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
              {TAGLINES[taglineIndex]}
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
            <Database size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
            <p className="text-sm text-[rgb(var(--text))] font-medium">Multi-Provider</p>
            <p className="text-xs text-[rgb(var(--muted))] mt-1">OpenAI, Anthropic, Ollama & more</p>
          </div>
          <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
            <SettingsIcon size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
            <p className="text-sm text-[rgb(var(--text))] font-medium">Customizable</p>
            <p className="text-xs text-[rgb(var(--muted))] mt-1">Fine-tune models & parameters</p>
          </div>
          <div className="bg-[rgb(var(--bg))] rounded-xl p-4 border border-[rgb(var(--border))]">
            <Eye size={20} className="text-[rgb(var(--text))] mb-2 mx-auto" />
            <p className="text-sm text-[rgb(var(--text))] font-medium">Privacy First</p>
            <p className="text-xs text-[rgb(var(--muted))] mt-1">All data stored locally</p>
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <a
            href="https://github.com/kokofixcomputers/lumina-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-2 px-4 gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            GitHub
          </a>
          <a
            href="https://github.com/kokofixcomputers/lumina-chat/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-2 px-4 gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Report Issue
          </a>
        </div>

        <div className="pt-2 text-xs text-[rgb(var(--muted))]">
          <p>Created by kokofixcomputers</p>
        </div>

        <div className="text-sm text-[rgb(var(--muted))]">
          <p>Build {shortSha}</p>
          {tauriVersion && <p>Desktop App {tauriVersion}</p>}
        </div>
      </div>
    </div>
  );
}
