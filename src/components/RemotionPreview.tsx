import { useState, useEffect } from 'react';
import * as Babel from '@babel/standalone';
import { Player } from '@remotion/player';
import React from 'react';
import { AbsoluteFill, Sequence, Series, useCurrentFrame, useVideoConfig, interpolate, spring, random, staticFile } from 'remotion';
import { Video, Audio } from '@remotion/media';

interface RemotionPreviewProps {
  code: string;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
}

export default function RemotionPreview({ 
  code, 
  durationInFrames, 
  fps, 
  compositionWidth, 
  compositionHeight 
}: RemotionPreviewProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const compileComponent = () => {
      try {
        console.log('Starting compilation...');
        
        // Step 1: Remove imports (these are injected manually)
        let codeWithoutImports = code.replace(/^import\s+.*$/gm, '').trim();
        console.log('After removing imports:', codeWithoutImports.substring(0, 100) + '...');

        // Step 2: Remove export statements
        codeWithoutImports = codeWithoutImports.replace(/^export\s+/gm, '');

        // Step 3: Remove default export statements
        codeWithoutImports = codeWithoutImports.replace(/^\s*default\s+\w+.*$/gm, '');

        // Step 4: Add fps to spring() calls if not present
        codeWithoutImports = codeWithoutImports.replace(/spring\(\{([^}]*?)\}\)/g, (match, content) => {
          if (!content.includes('fps')) {
            return `spring({ fps: ${fps}, ${content} })`;
          }
          return match;
        });

        // Step 5: Extract component body from "const X = () => { ... };"
        const match = codeWithoutImports.match(/const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\};/);
        let componentBody = match ? match[1].trim() : codeWithoutImports;
        
        // Remove any additional code after the first component (like default exports)
        const extraCodeMatch = componentBody.match(/^(.*?)(?:\/\/.*export default.*|export default.*|\/\/.*Optional.*)$/s);
        if (extraCodeMatch) {
          componentBody = extraCodeMatch[1].trim();
        }
        
        console.log('Component body extracted:', componentBody.substring(0, 100) + '...');

        // Step 6: Wrap it back into a component
        const wrappedSource = `const DynamicComponent = () => {\n${componentBody}\n};`;
        console.log('Wrapped source:', wrappedSource.substring(0, 100) + '...');

        // Step 7: Transpile with Babel
        const transpiled = Babel.transform(wrappedSource, {
          presets: ['react', 'typescript'],
          filename: 'remotion-component.tsx',
        });
        
        if (!transpiled.code) {
          throw new Error('Babel transpilation failed - no code generated');
        }
        
        console.log('Transpiled code:', transpiled.code.substring(0, 100) + '...');

        // Step 8: Use Function constructor to create the component with injected Remotion APIs
        const createComponent = new Function(
          'React',
          'AbsoluteFill',
          'Sequence',
          'Series',
          'useCurrentFrame',
          'useVideoConfig',
          'interpolate',
          'spring',
          'random',
          'staticFile',
          'Video',
          'Audio',
          `${transpiled.code}\nreturn DynamicComponent;`
        );

        // Step 9: Call the function with the actual imports
        const Component = createComponent(
          React,
          AbsoluteFill,
          Sequence,
          Series,
          useCurrentFrame,
          useVideoConfig,
          interpolate,
          spring,
          random,
          staticFile,
          Video,
          Audio
        );
        console.log('Component created successfully:', typeof Component);
        setComponent(() => Component);
        setError(null);
      } catch (err) {
        console.error('Failed to compile Remotion component:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setComponent(null);
      }
    };

    compileComponent();
  }, [code, fps]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
        <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="p-4 bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[rgb(var(--text))]"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[rgb(var(--panel))] border border-[rgb(var(--border))] rounded-xl overflow-hidden">
      <div style={{ width: '100%', aspectRatio: `${compositionWidth}/${compositionHeight}`, minHeight: '300px' }}>
        <Player
          component={Component}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={compositionWidth}
          compositionHeight={compositionHeight}
          controls
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
