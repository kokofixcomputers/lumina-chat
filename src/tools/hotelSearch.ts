import { defineTool } from '../types/tools';

function getActiveConvHotelSearchKey(): string | null {
  const activeConvId = sessionStorage.getItem('activeConvId');
  if (!activeConvId) return null;
  const conversations = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
  const conv = conversations.find((c: any) => c.id === activeConvId);
  return conv?.hotelSearchKey || null;
}

async function pollResults(searchKey: string, page: number, size: number) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 2000));

    const res = await fetch('https://locktrip.com/mcp/tools/get_search_results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchKey, page, size }),
    });

    if (!res.ok) throw new Error(`Get results failed: ${res.status}`);
    const data = await res.json();

    if (data.searchStatus === 'COMPLETED' || (data.hotels?.length > 0 && data.searchStatus !== 'IN_PROGRESS')) {
      return {
        hotels: (data.hotels || []).map(({ images, amenities, latitude, longitude, discountScore, quality, availableMealTypes, ...h }: any) => h),
        totalCount: data.totalCount,
        page: data.page,
        hasMore: data.hasMore,
      };
    }
  }
  throw new Error('Hotel search timed out');
}

export const hotelSearch = defineTool(
  'hotel_search',
  'Search hotels in a city. Use city_search first to get the cityId. Stores the search session for pagination with hotel_search_page.',
  {
    type: 'object',
    properties: {
      cityId: { type: 'string', description: 'City ID from city_search' },
      startDate: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
      adults: { type: 'number', description: 'Number of adults (default: 2)' },
      childrenAges: { type: 'array', items: { type: 'number' }, description: 'Ages of children e.g. [10, 3]' },
      currency: { type: 'string', description: 'Currency code (default: USD)' },
      nationality: { type: 'string', description: 'Guest nationality code e.g. US, CA (default: US)' },
      size: { type: 'number', description: 'Results per page (default: 10)' },
    },
    required: ['cityId', 'startDate', 'endDate'],
  },
  async (args: { cityId: string; startDate: string; endDate: string; adults?: number; childrenAges?: number[]; currency?: string; nationality?: string; size?: number }) => {
    const searchRes = await fetch('https://locktrip.com/mcp/tools/hotel_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        regionId: args.cityId,
        startDate: args.startDate,
        endDate: args.endDate,
        currency: args.currency || 'USD',
        rooms: [{ adults: args.adults ?? 2, ...(args.childrenAges?.length ? { childrenAges: args.childrenAges } : {}) }],
        nationality: args.nationality || 'US',
      }),
    });

    if (!searchRes.ok) throw new Error(`Hotel search failed: ${searchRes.status}`);
    const { searchKey } = await searchRes.json();

    const result = await pollResults(searchKey, 0, args.size ?? 10);

    return { ...result, searchKey, _hotelSearchKey: searchKey };
  }
);

export const hotelSearchPage = defineTool(
  'hotel_search_page',
  'Fetch the next page of hotel results from the current search session. Use after hotel_search.',
  {
    type: 'object',
    properties: {
      page: { type: 'number', description: 'Page number to fetch (0-based)' },
      size: { type: 'number', description: 'Results per page (default: 10)' },
    },
    required: ['page'],
  },
  async (args: { page: number; size?: number }) => {
    const searchKey = getActiveConvHotelSearchKey();
    if (!searchKey) throw new Error('No active hotel search session. Run hotel_search first.');

    const res = await fetch('https://locktrip.com/mcp/tools/get_search_results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchKey, page: args.page, size: args.size ?? 10 }),
    });

    if (!res.ok) throw new Error(`Get results failed: ${res.status}`);
    const data = await res.json();

    return {
      hotels: (data.hotels || []).map(({ images, amenities, latitude, longitude, discountScore, quality, availableMealTypes, ...h }: any) => h),
      totalCount: data.totalCount,
      page: data.page,
      hasMore: data.hasMore,
    };
  }
);

export default [hotelSearch, hotelSearchPage];
