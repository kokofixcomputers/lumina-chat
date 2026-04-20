import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Message } from '../types';

interface RetryNavigationProps {
  message: Message;
  onVersionChange: (versionIndex: number) => void;
}

export default function RetryNavigation({ message, onVersionChange }: RetryNavigationProps) {
  const [currentVersion, setCurrentVersion] = useState(0);
  
  // Extract retry attempts from the message versions
  const getRetryAttempts = () => {
    if (!message.versions || message.versions.length === 0) {
      return [message]; // Current message as the only version
    }
    
    // Return all versions including current
    return [...message.versions, message];
  };
  
  const retryAttempts = getRetryAttempts();
  const hasMultipleVersions = retryAttempts.length > 1;
  
  useEffect(() => {
    // Sync with message's current version index
    if (message.currentVersionIndex !== undefined) {
      setCurrentVersion(message.currentVersionIndex);
    }
  }, [message.currentVersionIndex]);
  
  if (!hasMultipleVersions) {
    return null;
  }
  
  const handlePrevious = () => {
    if (currentVersion > 0) {
      const newVersion = currentVersion - 1;
      setCurrentVersion(newVersion);
      onVersionChange(newVersion);
    }
  };
  
  const handleNext = () => {
    if (currentVersion < retryAttempts.length - 1) {
      const newVersion = currentVersion + 1;
      setCurrentVersion(newVersion);
      onVersionChange(newVersion);
    }
  };
  
  const getVersionLabel = (index: number) => {
    if (index === retryAttempts.length - 1) {
      return 'Latest';
    }
    return `<${index + 1}>`;
  };
  
  return (
    <div className="flex items-center gap-2 mb-2 p-2 bg-[rgb(var(--accent))]/10 rounded-lg border border-[rgb(var(--accent))]/20">
      <button
        onClick={handlePrevious}
        disabled={currentVersion === 0}
        className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed"
        title="Previous retry"
      >
        <ChevronLeft size={14} />
      </button>
      
      <div className="flex items-center gap-1">
        {retryAttempts.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setCurrentVersion(index);
              onVersionChange(index);
            }}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              index === currentVersion
                ? 'bg-[rgb(var(--accent))] text-white'
                : 'bg-[rgb(var(--bg))] text-[rgb(var(--text))] hover:bg-[rgb(var(--border))]'
            }`}
            title={getVersionLabel(index)}
          >
            {index === retryAttempts.length - 1 ? (
              <span className="font-bold">Latest</span>
            ) : (
              `<${index + 1}>`
            )}
          </button>
        ))}
      </div>
      
      <button
        onClick={handleNext}
        disabled={currentVersion === retryAttempts.length - 1}
        className="btn-icon disabled:opacity-50 disabled:cursor-not-allowed"
        title="Next retry"
      >
        <ChevronRight size={14} />
      </button>
      
      <span className="text-xs text-[rgb(var(--muted))] ml-2">
        {getVersionLabel(currentVersion)}
      </span>
    </div>
  );
}
