import { defineTool } from '../types/tools';

export default defineTool(
  'get_current_time',
  'Get the current date and time',
  {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional timezone (e.g., "America/New_York"). Defaults to local timezone.'
      }
    }
  },
  async (args: { timezone?: string }) => {
    const date = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: args.timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    };
    return {
      datetime: date.toLocaleString('en-US', options),
      timestamp: date.getTime(),
      timezone: args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
);
