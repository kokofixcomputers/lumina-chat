export interface ToolConfig {
  name: string;
  label: string;
  description: string;
  requiresApiKey?: {
    key: string;
    serviceName: string;
    color: 'blue' | 'green' | 'purple' | 'orange';
  };
  category?: 'search' | 'development' | 'data' | 'utility' | 'communication';
}

export const toolsConfig: ToolConfig[] = [
  {
    name: 'get_current_time',
    label: 'get_current_time',
    description: 'Get the current date and time',
    category: 'utility'
  },
  {
    name: 'calculate',
    label: 'calculate',
    description: 'Perform mathematical calculations',
    category: 'utility'
  },
  {
    name: 'chart',
    label: 'chart',
    description: 'Generate dynamic charts using Chart.js',
    category: 'data'
  },
  {
    name: 'exec_python',
    label: 'exec_python',
    description: 'Execute Python code using Pyodide (numpy, pandas, matplotlib)',
    category: 'development'
  },
  {
    name: 'google_search',
    label: 'google_search',
    description: 'Search Google for information',
    category: 'search',
    requiresApiKey: {
      key: 'serperApiKey',
      serviceName: 'Serper',
      color: 'blue'
    }
  },
  {
    name: 'amazon_search',
    label: 'amazon_search',
    description: 'Search Amazon products in real-time',
    category: 'search',
    requiresApiKey: {
      key: 'serperApiKey',
      serviceName: 'Serper',
      color: 'blue'
    }
  },
  {
    name: 'city_search',
    label: 'city_search',
    description: 'Search for cities (use with hotel_search)',
    category: 'search',
    requiresApiKey: {
      key: 'serperApiKey',
      serviceName: 'Serper',
      color: 'blue'
    }
  },
  {
    name: 'hotel_search',
    label: 'hotel_search',
    description: 'Search hotels in a city',
    category: 'search',
    requiresApiKey: {
      key: 'serperApiKey',
      serviceName: 'Serper',
      color: 'blue'
    }
  },
  {
    name: 'hotel_search_page',
    label: 'hotel_search_page',
    description: 'Fetch next page of hotel results',
    category: 'search',
    requiresApiKey: {
      key: 'serperApiKey',
      serviceName: 'Serper',
      color: 'blue'
    }
  },
  {
    name: 'web_request',
    label: 'web_request',
    description: 'Fetch and scrape content from a URL',
    category: 'utility',
    requiresApiKey: {
      key: 'scrapingBeeApiKey',
      serviceName: 'ScrapingBee',
      color: 'orange'
    }
  },
  {
    name: 'qanda',
    label: 'qanda',
    description: 'Ask the user clarifying questions',
    category: 'communication'
  },
  {
    name: 'create_dev_env',
    label: 'create_dev_env',
    description: 'Create Alpine Linux dev environment',
    category: 'development'
  },
  {
    name: 'command_dev_env',
    label: 'command_dev_env',
    description: 'Execute commands in dev environment',
    category: 'development'
  },
  {
    name: 'artifact_dev_env',
    label: 'artifact_dev_env',
    description: 'Download files from dev environment',
    category: 'development'
  }
];

export const apiKeysConfig = [
  {
    key: 'serperApiKey',
    label: 'Serper API Key',
    description: 'API key for Google Search functionality',
    placeholder: 'Enter your Serper API key',
    helpText: 'Get your key at serper.dev',
    helpUrl: 'https://serper.dev',
    serviceName: 'Serper',
    color: 'blue'
  },
  {
    key: 'scrapingBeeApiKey',
    label: 'ScrapingBee API Key',
    description: 'API key for web scraping functionality',
    placeholder: 'Enter your ScrapingBee API key',
    helpText: 'Get your key at scrapingbee.com',
    helpUrl: 'https://www.scrapingbee.com',
    serviceName: 'ScrapingBee',
    color: 'orange'
  }
];

export function getToolsByCategory(category: ToolConfig['category']) {
  return toolsConfig.filter(tool => tool.category === category);
}

export function getToolsRequiringApiKey(apiKey: string) {
  return toolsConfig.filter(tool => tool.requiresApiKey?.key === apiKey);
}

export function getApiKeyColor(color: string) {
  switch (color) {
    case 'blue':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'green':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'purple':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'orange':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
  }
}
