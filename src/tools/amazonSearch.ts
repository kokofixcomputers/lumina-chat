import { defineTool } from '../types/tools';

const domainMap: Record<string, string> = {
  US: 'com', CA: 'ca', GB: 'co.uk', DE: 'de', FR: 'fr',
  IT: 'it', ES: 'es', JP: 'co.jp', AU: 'com.au', IN: 'in',
  MX: 'com.mx', BR: 'com.br', NL: 'nl', SE: 'se', PL: 'pl',
  TR: 'com.tr', AE: 'ae', SA: 'sa', SG: 'sg',
};

const currencyMap: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', DE: 'EUR', FR: 'EUR',
  IT: 'EUR', ES: 'EUR', JP: 'JPY', AU: 'AUD', IN: 'INR',
  MX: 'MXN', BR: 'BRL', NL: 'EUR', SE: 'SEK', PL: 'PLN',
  TR: 'TRY', AE: 'AED', SA: 'SAR', SG: 'SGD',
};

export default defineTool(
  'amazon_search',
  'Search Amazon for products with real-time data including prices, ratings, and reviews. Automatically detects user country. Prefer cheapest options with highest ratings.',
  {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Product search query' },
      sort_by: {
        type: 'string',
        enum: ['featured', 'bestsellers', 'most_recent', 'price_low_to_high', 'price_high_to_low', 'average_review'],
        description: 'Sort order for results (default: relevance)'
      },
      pages: { type: 'number', description: 'Number of pages to fetch (default: 1)' },
    },
    required: ['query']
  },
  async (args: { query: string; sort_by?: string; pages?: number }) => {
    const settingsData = localStorage.getItem('lumina_settings');
    let apiKey = '';
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData);
        apiKey = settings.scrapingBeeApiKey || '';
      } catch {}
    }

    if (!apiKey) throw new Error('ScrapingBee API key not configured');

    const countryRes = await fetch('https://api.country.is').catch(() => null);
    const countryData = countryRes?.ok ? await countryRes.json().catch(() => null) : null;
    const country = (countryData?.country || 'US').toUpperCase();

    const domain = domainMap[country] || 'com';
    const currency = currencyMap[country] || 'USD';

    const params = new URLSearchParams({
      api_key: apiKey,
      query: args.query,
      light_request: 'true',
      domain,
      currency,
      sort_by: args.sort_by || 'relevance',
      start_page: '1',
      pages: String(args.pages || 1),
    });

    const response = await fetch(`https://app.scrapingbee.com/api/v1/amazon/search?${params}`);

    if (!response.ok) throw new Error(`Amazon search failed: ${response.status}`);

    const data = await response.json();
    data.products = (data.products || []).map(({ url_image, url, ...p }: any) => ({
      ...p,
      url: `https://www.amazon.${domain}${url}`,
    }));
    return data;
  }
);
