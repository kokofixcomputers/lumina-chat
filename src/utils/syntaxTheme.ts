import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
}

function rgbStr(name: string): string {
  const v = cssVar(name);
  if (!v) return '';
  const [r, g, b] = v.trim().split(/\s+/).map(Number);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Returns a react-syntax-highlighter Prism style object.
 *
 * Token syntax colours (keywords, strings, numbers, etc.) are left exactly as
 * oneDark / oneLight — they form a coherent palette and don't depend on the
 * app's accent colour. Only the chrome (editor background, gutter) is
 * overridden to match the active CSS theme variables so the block blends into
 * the surrounding UI.
 */
export function buildSyntaxStyle(): Record<string, React.CSSProperties> {
  const isDark = document.documentElement.classList.contains('dark');
  const base = isDark ? oneDark : oneLight;

  const bg    = rgbStr('panel');   // code block background ← panel colour
  const text  = rgbStr('text');    // default text colour

  if (!bg) return base; // CSS vars not ready yet, fall back to stock theme

  return {
    ...base,
    'code[class*="language-"]': {
      ...(base['code[class*="language-"]'] as React.CSSProperties),
      color: text,
      background: bg,
    },
    'pre[class*="language-"]': {
      ...(base['pre[class*="language-"]'] as React.CSSProperties),
      background: bg,
    },
  };
}
