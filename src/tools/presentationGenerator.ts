import pptxgen from "pptxgenjs";

export interface PresentationTheme {
  mode: 'dark' | 'light';
  palette: {
    bg: string;
    bgSecondary: string;
    text: string;
    textMuted: string;
    accent: string;
    accent2: string;
    accentLight: string;
    surface: string;
    surfaceSecondary: string;
    border: string;
  };
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  shadows: {
    light: string;
    medium: string;
    heavy: string;
  };
}

export interface PresentationDeck {
  title: string;
  subtitle: string;
  audience: string;
  goal: string;
  style_preset: string;
  theme: PresentationTheme;
}

export interface SlideContent {
  type: 'hero-cover' | 'big-statement' | 'split-story' | 'stat-grid' | 'tension-slide' | 'editorial-quote' | 'chart-insight' | 'title' | 'three-cards' | 'bar-chart' | 'bullet-points' | 'quote' | 'two-column';
  headline?: string;
  subheadline?: string;
  visual?: {
    kind: 'icon' | 'image' | 'gradient' | 'pattern';
    icon?: string;
    image?: string;
    gradient?: string;
    pattern?: string;
  };
  cards?: Array<{
    title: string;
    body: string;
    accent?: string;
  }>;
  chart?: {
    labels: string[];
    values: number[];
    unit?: string;
    insight?: string;
    accent?: string;
  };
  bullets?: string[];
  leftColumn?: string;
  rightColumn?: string;
  statement?: string;
  stats?: Array<{
    value: string;
    label: string;
    accent?: string;
  }>;
  quote?: {
    text: string;
    attribution?: string;
  };
  opportunities?: string[];
  risks?: string[];
}

export interface PresentationData {
  deck: PresentationDeck;
  slides: SlideContent[];
}

export class PresentationGenerator {
  private pptx: pptxgen;
  private theme: PresentationTheme;

  constructor(theme: PresentationTheme) {
    this.pptx = new pptxgen();
    // Enhance theme with rich design tokens
    this.theme = this.enhanceTheme(theme);
    this.setupPresentation();
  }

  private enhanceTheme(theme: PresentationTheme): PresentationTheme {
    return {
      ...theme,
      palette: {
        ...theme.palette,
        bgSecondary: theme.palette.bgSecondary || (theme.mode === 'dark' ? '#2D3748' : '#F7FAFC'),
        textMuted: theme.palette.textMuted || (theme.mode === 'dark' ? '#A0AEC0' : '#718096'),
        accentLight: theme.palette.accentLight || this.adjustColorBrightness(theme.palette.accent, 0.3),
        surface: theme.palette.surface || (theme.mode === 'dark' ? '#1A202C' : '#FFFFFF'),
        surfaceSecondary: theme.palette.surfaceSecondary || (theme.mode === 'dark' ? '#2D3748' : '#F7FAFC'),
        border: theme.palette.border || (theme.mode === 'dark' ? '#4A5568' : '#E2E8F0'),
      },
      fonts: {
        ...theme.fonts,
        mono: theme.fonts.mono || 'Consolas',
      },
      spacing: {
        xs: 0.2,
        sm: 0.4,
        md: 0.8,
        lg: 1.2,
        xl: 2.0,
        xxl: 3.0,
      },
      borderRadius: {
        sm: 0.1,
        md: 0.2,
        lg: 0.4,
        xl: 0.6,
      },
      shadows: {
        light: 'rgba(0,0,0,0.1)',
        medium: 'rgba(0,0,0,0.2)',
        heavy: 'rgba(0,0,0,0.3)',
      },
    };
  }

  private adjustColorBrightness(hex: string, factor: number): string {
    const rgb = this.hexToRgb(hex);
    const r = Math.round(rgb.r + (255 - rgb.r) * factor);
    const g = Math.round(rgb.g + (255 - rgb.g) * factor);
    const b = Math.round(rgb.b + (255 - rgb.b) * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private safeText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(v => this.safeText(v)).join('\n');
    if (typeof value === 'object') {
      if ('text' in (value as Record<string, unknown>)) {
        return this.safeText((value as Record<string, unknown>).text);
      }
      return JSON.stringify(value);
    }
    return String(value);
  }

  private setupPresentation() {
    this.pptx.layout = 'LAYOUT_WIDE';
    this.pptx.author = 'Lumina Chat AI';
    this.pptx.subject = 'AI Generated Presentation';
    this.pptx.title = this.theme.mode === 'dark' ? 'Dark Theme' : 'Light Theme';
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  private getContrastColor(hexColor: string): string {
    const rgb = this.hexToRgb(hexColor);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '000000' : 'FFFFFF';
  }

  private createTitleSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Main title
    if (slide.headline) {
      slideObj.addText(slide.headline, {
        x: 1,
        y: 2.5,
        w: 8,
        h: 1.2,
        fontSize: 44,
        bold: true,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center'
      });
    }

    // Subtitle
    if (slide.subheadline) {
      slideObj.addText(slide.subheadline, {
        x: 1,
        y: 3.8,
        w: 8,
        h: 0.6,
        fontSize: 24,
        color: this.theme.palette.accent.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'center'
      });
    }

    // Hero icon placeholder
    if (slide.visual?.kind === 'hero-icon') {
      slideObj.addText(`⚡ ${slide.visual.icon || 'AI'}`, {
        x: 4.5,
        y: 5.5,
        w: 1,
        h: 1,
        fontSize: 48,
        color: this.theme.palette.accent2.replace('#', ''),
        align: 'center'
      });
    }
  }

  private createThreeCardsSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Headline
    if (slide.headline) {
      slideObj.addText(slide.headline, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center'
      });
    }

    // Three cards
    const cardWidth = 2.8;
    const cardHeight = 3;
    const cardY = 2;
    const cardSpacing = 0.3;
    const startX = 0.8;

    slide.cards?.forEach((card, index) => {
      const x = startX + (cardWidth + cardSpacing) * index;
      
      // Card background
      slideObj.addShape('rect', {
        x,
        y: cardY,
        w: cardWidth,
        h: cardHeight,
        fill: { color: this.theme.mode === 'dark' ? '1E293B' : 'F8FAFC' },
        line: { color: this.theme.palette.accent.replace('#', ''), width: 1 }
      });

      // Card title
      slideObj.addText(card.title, {
        x: x + 0.2,
        y: cardY + 0.3,
        w: cardWidth - 0.4,
        h: 0.6,
        fontSize: 18,
        bold: true,
        color: this.theme.palette.accent.replace('#', ''),
        fontFace: this.theme.fonts.body
      });

      // Card body
      slideObj.addText(card.body, {
        x: x + 0.2,
        y: cardY + 1,
        w: cardWidth - 0.4,
        h: cardHeight - 1.3,
        fontSize: 14,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.body,
        wrapText: true
      });
    });
  }

  private createBarChartSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Headline
    if (slide.headline) {
      slideObj.addText(slide.headline, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center'
      });
    }

    // Chart data
    if (slide.chart) {
      const chartData = slide.chart.labels.map((label, index) => ({
        name: label,
        labels: [label],
        values: [slide.chart!.values[index]],
      }));

      const chart = slideObj.addChart('bar', chartData, {
        x: 1,
        y: 1.8,
        w: 8,
        h: 4,
        barColors: [this.theme.palette.accent.replace('#', '')],
        showLegend: false,
        showValue: true,
        chartColors: [this.theme.palette.accent.replace('#', '')],
      });
    }

    // Insight
    if (slide.insight) {
      slideObj.addText(slide.insight, {
        x: 1,
        y: 6,
        w: 8,
        h: 0.6,
        fontSize: 16,
        italic: true,
        color: this.theme.palette.accent2.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'center'
      });
    }
  }

  private createBulletPointsSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Headline
    if (slide.headline) {
      slideObj.addText(slide.headline, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center'
      });
    }

    // Bullet points
    if (slide.bullets) {
      const bulletY = 2;
      const bulletSpacing = 0.6;
      
      slide.bullets.forEach((bullet, index) => {
        slideObj.addText(`• ${bullet}`, {
          x: 1,
          y: bulletY + (bulletSpacing * index),
          w: 8,
          h: 0.5,
          fontSize: 18,
          color: this.theme.palette.text.replace('#', ''),
          fontFace: this.theme.fonts.body,
          wrapText: true
        });
      });
    }
  }

  private createQuoteSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Quote
    if (slide.bullets && slide.bullets[0]) {
      slideObj.addText(`"${slide.bullets[0]}"`, {
        x: 1,
        y: 2.5,
        w: 8,
        h: 2,
        fontSize: 36,
        italic: true,
        color: this.theme.palette.accent.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center',
        wrapText: true
      });
    }

    // Attribution
    if (slide.bullets && slide.bullets[1]) {
      slideObj.addText(`— ${slide.bullets[1]}`, {
        x: 6,
        y: 4.5,
        w: 3,
        h: 0.5,
        fontSize: 16,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'right'
      });
    }
  }

  private createTwoColumnSlide(slide: SlideContent): void {
    const slideObj = this.pptx.addSlide();
    
    // Background
    slideObj.background = { color: this.theme.palette.bg };

    // Headline
    if (slide.headline) {
      slideObj.addText(slide.headline, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.display,
        align: 'center'
      });
    }

    // Left column
    if (slide.leftColumn) {
      slideObj.addText(slide.leftColumn, {
        x: 0.5,
        y: 1.8,
        w: 4,
        h: 4,
        fontSize: 16,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.body,
        wrapText: true
      });
    }

    // Right column
    if (slide.rightColumn) {
      slideObj.addText(slide.rightColumn, {
        x: 5.5,
        y: 1.8,
        w: 4,
        h: 4,
        fontSize: 16,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.body,
        wrapText: true
      });
    }
  }

  private createHeroCoverSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Add gradient background
    const gradientFill = {
      type: 'gradient',
      colors: [
        { position: 0, color: this.theme.palette.accent.replace('#', '') },
        { position: 100, color: this.theme.palette.bg.replace('#', '') }
      ],
      angle: 135
    };
    slideObj.background = { fill: gradientFill };
    
    // Add decorative shape in background
    slideObj.addShape('ellipse', {
      x: 6, y: 2, w: 8, h: 8,
      fill: { color: this.adjustColorBrightness(this.theme.palette.accent, 0.1) },
      line: { color: 'transparent' },
      transparency: 70
    });
    
    // Add oversized title
    slideObj.addText(this.safeText(slide.headline), {
      x: this.theme.spacing.xl,
      y: 2,
      w: 8,
      h: 2,
      fontSize: 44,
      bold: true,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'left'
    });
    
    // Add subtitle
    slideObj.addText(this.safeText(slide.subheadline), {
      x: this.theme.spacing.xl,
      y: 4,
      w: 7,
      h: 1,
      fontSize: 20,
      color: this.theme.palette.textMuted.replace('#', ''),
      fontFace: this.theme.fonts.body,
      align: 'left'
    });
    
    // Add visual element (icon or decorative element)
    if (slide.visual?.icon) {
      slideObj.addText(this.safeText(slide.visual.icon), {
        x: 8,
        y: 5.5,
        w: 2,
        h: 2,
        fontSize: 72,
        color: this.theme.palette.accent.replace('#', ''),
        align: 'center'
      });
    }
  }

  private createBigStatementSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Dark, dramatic background
    slideObj.background = { fill: { color: this.theme.palette.bgSecondary.replace('#', '') } };
    
    // Add oversized statement text
    slideObj.addText(this.safeText(slide.statement || slide.headline), {
      x: this.theme.spacing.xl,
      y: 3,
      w: 8,
      h: 3,
      fontSize: 48,
      bold: true,
      color: this.theme.palette.accent.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'center',
      valign: 'middle'
    });
    
    // Add subtle attribution if available
    if (slide.subheadline) {
      slideObj.addText(this.safeText(slide.subheadline), {
        x: this.theme.spacing.xl,
        y: 6,
        w: 8,
        h: 0.5,
        fontSize: 16,
        color: this.theme.palette.textMuted.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'center',
        italic: true
      });
    }
  }

  private createSplitStorySlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Clean background
    slideObj.background = { fill: { color: this.theme.palette.surface.replace('#', '') } };
    
    // Left side - text content
    const leftText = slide.bullets?.join('\n\n') || slide.leftColumn || '';
    slideObj.addText(this.safeText(leftText), {
      x: this.theme.spacing.xl,
      y: this.theme.spacing.xl,
      w: 4.5,
      h: 6,
      fontSize: 18,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.body,
      align: 'left',
      valign: 'top'
    });
    
    // Right side - visual area or accent content
    if (slide.rightColumn) {
      // Add accent panel
      slideObj.addShape('rect', {
        x: 6.5, y: this.theme.spacing.xl, w: 3.5, h: 6,
        fill: { color: this.theme.palette.accent.replace('#', '') },
        line: { color: 'transparent' },
        transparency: 10
      });
      
      slideObj.addText(this.safeText(slide.rightColumn), {
        x: 6.5,
        y: this.theme.spacing.xl,
        w: 3.5,
        h: 6,
        fontSize: 16,
        color: this.theme.palette.text.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'center',
        valign: 'middle'
      });
    }
  }

  private createStatGridSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Clean background
    slideObj.background = { fill: { color: this.theme.palette.surface.replace('#', '') } };
    
    // Add headline
    slideObj.addText(this.safeText(slide.headline), {
      x: this.theme.spacing.xl,
      y: this.theme.spacing.lg,
      w: 8,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'center'
    });
    
    // Create stat grid
    if (slide.stats && slide.stats.length > 0) {
      const statsPerRow = Math.min(slide.stats.length, 2);
      const statWidth = 3.5;
      const statHeight = 2;
      const startY = 2.5;
      
      slide.stats.forEach((stat, index) => {
        const row = Math.floor(index / statsPerRow);
        const col = index % statsPerRow;
        const x = this.theme.spacing.xl + (col * (statWidth + this.theme.spacing.md));
        const y = startY + (row * (statHeight + this.theme.spacing.lg));
        
        // Add stat panel
        slideObj.addShape('roundRect', {
          x, y, w: statWidth, h: statHeight,
          fill: { color: this.theme.palette.surfaceSecondary.replace('#', '') },
          line: { color: this.theme.palette.border.replace('#', ''), width: 1 },
          transparency: 50
        });
        
        // Add stat value
        slideObj.addText(this.safeText(stat.value), {
          x: x + this.theme.spacing.sm,
          y: y + this.theme.spacing.sm,
          w: statWidth - this.theme.spacing.md,
          h: 1,
          fontSize: 36,
          bold: true,
          color: (stat.accent || this.theme.palette.accent).replace('#', ''),
          fontFace: this.theme.fonts.display,
          align: 'center'
        });
        
        // Add stat label
        slideObj.addText(this.safeText(stat.label), {
          x: x + this.theme.spacing.sm,
          y: y + 1.2,
          w: statWidth - this.theme.spacing.md,
          h: 0.6,
          fontSize: 14,
          color: this.theme.palette.textMuted.replace('#', ''),
          fontFace: this.theme.fonts.body,
          align: 'center'
        });
      });
    }
  }

  private createTensionSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Split background
    slideObj.addShape('rect', {
      x: 0, y: 0, w: 5, h: 7.5,
      fill: { color: this.theme.palette.accent.replace('#', '') },
      line: { color: 'transparent' },
      transparency: 80
    });
    
    slideObj.addShape('rect', {
      x: 5, y: 0, w: 5, h: 7.5,
      fill: { color: this.theme.palette.accent2.replace('#', '') },
      line: { color: 'transparent' },
      transparency: 80
    });
    
    // Opportunities side
    slideObj.addText('Opportunities', {
      x: this.theme.spacing.xl,
      y: this.theme.spacing.xl,
      w: 3.5,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'center'
    });
    
    if (slide.opportunities && slide.opportunities.length > 0) {
      slide.opportunities.forEach((opp, index) => {
        slideObj.addText(`• ${opp}`, {
          x: this.theme.spacing.xl,
          y: 1.5 + (index * 0.6),
          w: 3.5,
          h: 0.5,
          fontSize: 16,
          color: this.theme.palette.text.replace('#', ''),
          fontFace: this.theme.fonts.body,
          align: 'left'
        });
      });
    }
    
    // Risks side
    slideObj.addText('Risks', {
      x: 6,
      y: this.theme.spacing.xl,
      w: 3.5,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'center'
    });
    
    if (slide.risks && slide.risks.length > 0) {
      slide.risks.forEach((risk, index) => {
        slideObj.addText(`• ${risk}`, {
          x: 6,
          y: 1.5 + (index * 0.6),
          w: 3.5,
          h: 0.5,
          fontSize: 16,
          color: this.theme.palette.text.replace('#', ''),
          fontFace: this.theme.fonts.body,
          align: 'left'
        });
      });
    }
  }

  private createEditorialQuoteSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Editorial background with subtle texture
    slideObj.background = { fill: { color: this.theme.palette.bgSecondary.replace('#', '') } };
    
    // Add oversized quote mark
    slideObj.addText('"', {
      x: this.theme.spacing.xl,
      y: 1,
      w: 2,
      h: 3,
      fontSize: 120,
      bold: true,
      color: this.theme.palette.accent.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'left',
      transparency: 30
    });
    
    // Add quote text
    const quoteText = slide.quote?.text || slide.bullets?.[0] || '';
    slideObj.addText(quoteText, {
      x: this.theme.spacing.xl + 1.5,
      y: 2.5,
      w: 7,
      h: 3,
      fontSize: 28,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.body,
      align: 'left',
      valign: 'middle',
      italic: true
    });
    
    // Add attribution
    const attribution = slide.quote?.attribution || slide.subheadline;
    if (attribution) {
      slideObj.addText(`— ${attribution}`, {
        x: this.theme.spacing.xl + 5,
        y: 5.5,
        w: 3,
        h: 0.5,
        fontSize: 16,
        color: this.theme.palette.textMuted.replace('#', ''),
        fontFace: this.theme.fonts.body,
        align: 'right'
      });
    }
  }

  private createChartInsightSlide(slide: SlideContent) {
    const slideObj = this.pptx.addSlide();
    
    // Clean background
    slideObj.background = { fill: { color: this.theme.palette.surface.replace('#', '') } };
    
    // Add headline
    slideObj.addText(slide.headline || '', {
      x: this.theme.spacing.xl,
      y: this.theme.spacing.lg,
      w: 8,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: this.theme.palette.text.replace('#', ''),
      fontFace: this.theme.fonts.display,
      align: 'center'
    });
    
    // Add chart (reuse existing chart logic)
    if (slide.chart) {
      const chartData = slide.chart.labels.map((label, index) => ({
        name: label,
        labels: [label],
        values: [slide.chart!.values[index]],
      }));

      slideObj.addChart('bar', chartData, {
        x: 1,
        y: 2,
        w: 8,
        h: 3.5,
        chartColors: [(slide.chart.accent || this.theme.palette.accent).replace('#', '')],
        showLegend: false,
        showValue: true,
        barGapWidthPct: 25,
      });
      
      // Add insight chip
      if (slide.chart.insight) {
        slideObj.addShape('roundRect', {
          x: 2,
          y: 5.8,
          w: 6,
          h: 0.8,
          fill: { color: (slide.chart.accent || this.theme.palette.accent).replace('#', '') },
          line: { color: 'transparent' },
          transparency: 20
        });
        
        slideObj.addText(slide.chart.insight, {
          x: 2,
          y: 5.8,
          w: 6,
          h: 0.8,
          fontSize: 14,
          color: this.theme.palette.text.replace('#', ''),
          fontFace: this.theme.fonts.body,
          align: 'center',
          valign: 'middle',
          bold: true
        });
      }
    }
  }

  async generatePresentation(data: PresentationData): Promise<ArrayBuffer> {
    // Generate slides based on type
    for (const slide of data.slides) {
      switch (slide.type) {
        // Cinematic slide types
        case 'hero-cover':
          this.createHeroCoverSlide(slide);
          break;
        case 'big-statement':
          this.createBigStatementSlide(slide);
          break;
        case 'split-story':
          this.createSplitStorySlide(slide);
          break;
        case 'stat-grid':
          this.createStatGridSlide(slide);
          break;
        case 'tension-slide':
          this.createTensionSlide(slide);
          break;
        case 'editorial-quote':
          this.createEditorialQuoteSlide(slide);
          break;
        case 'chart-insight':
          this.createChartInsightSlide(slide);
          break;
        // Legacy slide types
        case 'title':
          this.createTitleSlide(slide);
          break;
        case 'three-cards':
          this.createThreeCardsSlide(slide);
          break;
        case 'bar-chart':
          this.createBarChartSlide(slide);
          break;
        case 'bullet-points':
          this.createBulletPointsSlide(slide);
          break;
        case 'quote':
          this.createQuoteSlide(slide);
          break;
        case 'two-column':
          this.createTwoColumnSlide(slide);
          break;
        default:
          // Default to bullet points for unknown types
          this.createBulletPointsSlide({
            type: 'bullet-points',
            headline: slide.headline,
            bullets: ['Unknown slide type']
          });
      }
    }

    // Generate the presentation
    console.log('🎯 PRESENTATION GENERATOR: Generating ArrayBuffer using write() API');
    const result = await this.pptx.write({ outputType: 'arraybuffer' });
    console.log('🎯 PRESENTATION GENERATOR: write result type:', result?.constructor?.name);
    console.log('🎯 PRESENTATION GENERATOR: write result byteLength:', result?.byteLength);
    console.log('🎯 PRESENTATION GENERATOR: write result:', result);
    
    return result as ArrayBuffer;
  }
}

export async function createPresentation(data: PresentationData): Promise<ArrayBuffer> {
  console.log('🎯 PRESENTATION GENERATOR: Creating presentation for', data.deck?.title);
  const generator = new PresentationGenerator(data.deck.theme);
  const result = await generator.generatePresentation(data);
  console.log('🎯 PRESENTATION GENERATOR: Generated result type:', result?.constructor?.name);
  console.log('🎯 PRESENTATION GENERATOR: Generated result:', result);
  console.log('🎯 PRESENTATION GENERATOR: Result byteLength:', result?.byteLength);
  return result;
}
