export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  css: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic, north-bluish color palette',
    css: `/* Nord — https://www.nordtheme.com */
:root {
  --bg: 236 239 244;
  --panel: 229 233 240;
  --text: 46 52 64;
  --muted: 76 86 106;
  --border: 216 222 233;
  --accent: 94 129 172;
  --accent-contrast: 236 239 244;
}

.dark {
  --bg: 46 52 64;
  --panel: 59 66 82;
  --text: 236 239 244;
  --muted: 144 153 165;
  --border: 67 76 94;
  --accent: 136 192 208;
  --accent-contrast: 46 52 64;
}`,
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Latte (light) & Mocha (dark) — pastel mauve accent',
    css: `/* Catppuccin — https://catppuccin.com */
:root {
  --bg: 239 241 245;
  --panel: 230 233 239;
  --text: 76 79 105;
  --muted: 140 143 161;
  --border: 188 192 204;
  --accent: 136 57 239;
  --accent-contrast: 239 241 245;
}

.dark {
  --bg: 30 30 46;
  --panel: 24 24 37;
  --text: 205 214 244;
  --muted: 108 112 134;
  --border: 49 50 68;
  --accent: 203 166 247;
  --accent-contrast: 30 30 46;
}`,
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: 'Neon-lit streets — soft blue accent',
    css: `/* Tokyo Night */
:root {
  --bg: 213 214 219;
  --panel: 225 226 231;
  --text: 52 59 88;
  --muted: 132 137 160;
  --border: 180 181 189;
  --accent: 46 125 233;
  --accent-contrast: 255 255 255;
}

.dark {
  --bg: 26 27 38;
  --panel: 22 22 30;
  --text: 192 202 245;
  --muted: 86 95 137;
  --border: 41 46 66;
  --accent: 122 162 247;
  --accent-contrast: 26 27 38;
}`,
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    description: 'All natural pine, faux fur and a bit of soho glam',
    css: `/* Rosé Pine — https://rosepinetheme.com */
:root {
  --bg: 250 244 237;
  --panel: 255 250 243;
  --text: 87 82 121;
  --muted: 152 147 165;
  --border: 223 217 206;
  --accent: 180 99 122;
  --accent-contrast: 250 244 237;
}

.dark {
  --bg: 25 23 36;
  --panel: 31 29 46;
  --text: 224 222 244;
  --muted: 110 106 134;
  --border: 38 35 58;
  --accent: 235 188 186;
  --accent-contrast: 25 23 36;
}`,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Dark and moody — deep purple accent',
    css: `/* Midnight — darker */
:root {
  --bg: 234 238 247;
  --panel: 243 246 252;
  --text: 28 36 58;
  --muted: 96 108 138;
  --border: 206 214 230;
  --accent: 70 108 201;
  --accent-contrast: 255 255 255;
}

.dark {
  --bg: 5 8 18;
  --panel: 10 14 28;
  --text: 226 232 246;
  --muted: 128 139 166;
  --border: 24 32 56;
  --accent: 128 166 255;
  --accent-contrast: 5 8 18;
}`,},
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    description: 'Retro groove — warm amber on dark brown',
    css: `/* Gruvbox */
:root {
  --bg: 251 241 199;
  --panel: 242 229 188;
  --text: 60 56 54;
  --muted: 124 111 100;
  --border: 213 196 161;
  --accent: 215 153 33;
  --accent-contrast: 60 56 54;
}

.dark {
  --bg: 40 40 40;
  --panel: 50 48 47;
  --text: 235 219 178;
  --muted: 146 131 116;
  --border: 60 56 54;
  --accent: 250 189 47;
  --accent-contrast: 40 40 40;
}`,
  },
];
