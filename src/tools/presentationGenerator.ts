import pptxgen from "pptxgenjs";

export interface PresentationTheme {
  mode: 'dark' | 'light';
  palette: {
    bg: string;
    text: string;
    accent: string;
    accent2: string;
  };
  fonts: {
    display: string;
    body: string;
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
  type: 'title' | 'three-cards' | 'bar-chart' | 'bullet-points' | 'quote' | 'two-column';
  headline?: string;
  subheadline?: string;
  visual?: {
    kind: string;
    icon?: string;
  };
  cards?: Array<{
    title: string;
    body: string;
  }>;
  chart?: {
    labels: string[];
    values: number[];
    unit?: string;
  };
  insight?: string;
  bullets?: string[];
  leftColumn?: string;
  rightColumn?: string;
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
    this.theme = theme;
    this.setupPresentation();
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

  async generatePresentation(data: PresentationData): Promise<ArrayBuffer> {
    // Generate slides based on type
    for (const slide of data.slides) {
      switch (slide.type) {
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
