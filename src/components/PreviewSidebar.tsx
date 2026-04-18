import { useState, useEffect } from 'react';
import { X, Download, ExternalLink, Eye } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface PreviewData {
  code: string;
  language?: string;
  title: string;
}

export default function PreviewSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const handleShowPreview = (e: CustomEvent<PreviewData>) => {
      console.log('Preview event received:', e.detail);
      setPreviewData(e.detail);
      setIsOpen(true);
    };

    const handleClosePreview = () => setIsOpen(false);

    window.addEventListener('showPreview', handleShowPreview as EventListener);
    window.addEventListener('closePreview', handleClosePreview as EventListener);
    
    return () => {
      window.removeEventListener('showPreview', handleShowPreview as EventListener);
      window.removeEventListener('closePreview', handleClosePreview as EventListener);
    };
  }, []);

  // Only clear preview data when sidebar is manually closed, not when unmounted
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setPreviewData(null);
      }, 300); // Clear data after close animation
      return () => clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    // Check dark mode
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    
    checkDark();
    
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  const handleDownload = async () => {
    if (!previewData) return;
    
    // Check if running in Tauri
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    
    if (isTauri) {
      try {
        // Use Tauri's native save dialog
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        
        const defaultPath = `preview.${previewData.language || 'txt'}`;
        const filePath = await save({
          title: 'Save Preview',
          defaultPath,
          filters: [
            {
              name: previewData.language ? `${previewData.language} files` : 'Text files',
              extensions: [previewData.language || 'txt']
            },
            {
              name: 'All files',
              extensions: ['*']
            }
          ]
        });
        
        if (filePath) {
          await writeTextFile(filePath, previewData.code);
        }
      } catch (error) {
        console.error('Failed to save file:', error);
        // Fallback to browser download if Tauri fails
        fallbackDownload();
      }
    } else {
      // Fallback to browser download
      fallbackDownload();
    }
    
    function fallbackDownload() {
      const blob = new Blob([previewData.code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preview.${previewData.language || 'txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleOpenInNewTab = () => {
    if (!previewData) return;
    
    let htmlContent = '';
    let cssContent = `
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 20px;
          background: ${isDark ? '#1a1a1a' : '#ffffff'};
          color: ${isDark ? '#ffffff' : '#000000'};
        }
        pre { 
          background: ${isDark ? '#2d2d2d' : '#f5f5f5'};
          padding: 16px;
          border-radius: 8px;
          overflow-x: auto;
          border: 1px solid ${isDark ? '#404040' : '#e0e0e0'};
        }
      </style>
    `;
    
    if (previewData.language === 'html' || previewData.language === 'svg') {
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${previewData.title}</title>
          ${cssContent}
        </head>
        <body>
          ${previewData.language === 'svg' ? previewData.code : `<pre><code>${previewData.code}</code></pre>`}
        </body>
        </html>
      `;
    } else {
      // For other languages, create a simple HTML wrapper
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${previewData.title}</title>
          ${cssContent}
        </head>
        <body>
          <pre><code>${previewData.code}</code></pre>
        </body>
        </html>
      `;
    }
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full w-80 bg-[rgb(var(--panel))] border-l border-[rgb(var(--border))] shrink-0 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgb(var(--border))] shrink-0">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-blue-500" />
          <span className="text-sm font-semibold">Preview</span>
          {previewData?.language && (
            <span className="text-xs text-[rgb(var(--muted))]">({previewData.language})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleDownload} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]" title="Download">
            <Download size={13} />
          </button>
          <button onClick={handleOpenInNewTab} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]" title="Open in new tab">
            <ExternalLink size={13} />
          </button>
          <button onClick={() => setIsOpen(false)} className="btn-icon w-7 h-7 text-[rgb(var(--muted))]">
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex flex-col flex-1 min-h-0">
        {!previewData ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="text-center text-[rgb(var(--muted))]">
              <p className="text-sm">No Preview Data</p>
              <p className="text-xs mt-2">Click preview button on code to show content</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full overflow-auto p-4">
            {previewData.language === 'html' ? (
              <div className="w-full h-full border border-[rgb(var(--border))] rounded">
                <iframe
                  className="w-full h-full border-0"
                  srcDoc={previewData.code}
                  sandbox="allow-scripts"
                  title="HTML Preview"
                />
              </div>
            ) : previewData.language === 'svg' ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <div className="max-w-full max-h-full overflow-auto">
                  <div 
                    dangerouslySetInnerHTML={{ __html: previewData.code }}
                    className="max-w-full max-h-full"
                  />
                </div>
              </div>
            ) : (
              <SyntaxHighlighter 
                language={previewData.language || 'text'} 
                style={isDark ? oneDark : oneLight} 
                customStyle={{ margin: 0, background: 'transparent' }} 
                showLineNumbers={false}
              >
                {previewData.code}
              </SyntaxHighlighter>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {previewData?.language && (
        <div className="px-3 py-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--bg))]">
          <span className="text-xs font-mono text-[rgb(var(--muted))] bg-[rgb(var(--muted))] px-2 py-1 rounded">
            {previewData.language}
          </span>
        </div>
      )}
    </div>
  );
}
