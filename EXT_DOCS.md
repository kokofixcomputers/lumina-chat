# Chat Extension System Documentation

Welcome to the Chat Extension System! This documentation will guide you through creating custom tools and integrations that extend the functionality of the chat application.

## Overview

Extensions allow you to add custom tools and integrations to the chat application using JavaScript. Each extension can provide multiple tools that the AI assistant can use to perform specific tasks, and can also register external service integrations.

## Security Features

The extension system is designed with security in mind:

- **Sandboxed Environment**: Extensions run in a restricted sandbox with limited access to browser APIs
- **Input Validation**: All tool inputs are validated against schemas before execution
- **Timeout Protection**: Tools have a 30-second execution timeout to prevent hanging
- **No Dangerous APIs**: Access to dangerous APIs like `eval`, `fetch`, `localStorage`, etc. is blocked
- **Error Isolation**: Extension errors won't crash the main application

## Extension API

### Basic Structure

```javascript
const api = createChatExtensionAPI();

api.registerExtension({
  id: 'your.extension.id',
  name: 'Your Extension Name',
  version: '1.0.0',
  description: 'Description of your extension',
  author: 'Your Name',
  tools: [
    // Tools go here
  ]
});
```

### Extension Properties

- `id`: Unique identifier for your extension (required)
- `name`: Display name for your extension (required)
- `version`: Version string (required)
- `description`: Brief description of what your extension does (optional)
- `author`: Your name or organization (optional)
- `tools`: Array of tool definitions (required)

### Tool Structure

```javascript
{
  name: 'tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      parameter1: { type: 'string', description: 'Parameter description' },
      parameter2: { type: 'number', description: 'Another parameter' }
    },
    required: ['parameter1']
  },
  async call(args, ctx) {
    // Tool implementation
    return { result: 'Tool output' };
  }
}
```

### Tool Properties

- `name`: Unique tool name within the extension (required)
- `description`: Description of what the tool does (required)
- `inputSchema`: JSON schema for input validation (required)
- `call`: Async function that executes the tool (required)

### Input Schema

The `inputSchema` follows JSON Schema format:

```javascript
inputSchema: {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Text to process' },
    count: { type: 'number', description: 'Number of items' },
    enabled: { type: 'boolean', description: 'Whether to enable' },
    option: { 
      type: 'string', 
      enum: ['option1', 'option2'], 
      description: 'Select an option' 
    }
  },
  required: ['text', 'count']
}
```

Supported types: `string`, `number`, `boolean`

### Tool Context

The `call` function receives two parameters:

1. `args`: Object containing the validated input parameters
2. `ctx`: Context object with utility functions

#### Context Methods

```javascript
async call(args, ctx) {
  // Log messages (appears in browser console)
  ctx.log('Processing request...');
  
  // Log warnings
  ctx.warn('Something might be wrong');
  
  // Log errors
  ctx.error('An error occurred');
  
  // Access app settings (read-only)
  const settings = ctx.settings;
  
  // Your tool logic here
  return { result: 'Success!' };
}
```

## Examples

### Example 1: Math Tools Extension

```javascript
const api = createChatExtensionAPI();

api.registerExtension({
  id: 'demo.math',
  name: 'Math Tools',
  version: '1.0.0',
  description: 'Basic mathematical operations',
  author: 'Demo Author',
  tools: [
    {
      name: 'calculate',
      description: 'Evaluate a mathematical expression safely',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { 
            type: 'string', 
            description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4")' 
          }
        },
        required: ['expression']
      },
      async call(args, ctx) {
        // Simple math evaluator (safe, no eval)
        const expression = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
        
        if (!expression) {
          throw new Error('Invalid expression');
        }
        
        try {
          // Use Function constructor for safe math evaluation
          const result = new Function('return ' + expression)();
          
          ctx.log(`Evaluated: ${expression} = ${result}`);
          
          return {
            expression: args.expression,
            result: result,
            type: typeof result
          };
        } catch (error) {
          throw new Error('Failed to evaluate expression');
        }
      }
    },
    {
      name: 'random_number',
      description: 'Generate a random number in a range',
      inputSchema: {
        type: 'object',
        properties: {
          min: { type: 'number', description: 'Minimum value (default: 0)' },
          max: { type: 'number', description: 'Maximum value (default: 100)' }
        },
        required: []
      },
      async call(args, ctx) {
        const min = args.min || 0;
        const max = args.max || 100;
        
        if (min >= max) {
          throw new Error('Minimum must be less than maximum');
        }
        
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        
        ctx.log(`Generated random number: ${result} (range: ${min}-${max})`);
        
        return {
          result: result,
          range: { min, max }
        };
      }
    }
  ]
});
```

### Example 2: Text Processing Extension

```javascript
const api = createChatExtensionAPI();

api.registerExtension({
  id: 'demo.text',
  name: 'Text Processing Tools',
  version: '1.0.0',
  description: 'Tools for text manipulation and analysis',
  author: 'Demo Author',
  tools: [
    {
      name: 'word_count',
      description: 'Count words, characters, and sentences in text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          include_spaces: { 
            type: 'boolean', 
            description: 'Include spaces in character count' 
          }
        },
        required: ['text']
      },
      async call(args, ctx) {
        const text = args.text;
        const includeSpaces = args.include_spaces !== false;
        
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const characters = includeSpaces ? text.length : text.replace(/\s/g, '').length;
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
        
        ctx.log(`Analyzed text: ${words.length} words, ${sentences.length} sentences`);
        
        return {
          words: words.length,
          characters: characters,
          sentences: sentences.length,
          paragraphs: paragraphs.length,
          average_words_per_sentence: Math.round((words.length / sentences.length) * 100) / 100
        };
      }
    },
    {
      name: 'text_transform',
      description: 'Transform text case and format',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to transform' },
          operation: { 
            type: 'string', 
            enum: ['uppercase', 'lowercase', 'title', 'reverse', 'camel'],
            description: 'Transformation operation' 
          }
        },
        required: ['text', 'operation']
      },
      async call(args, ctx) {
        const { text, operation } = args;
        let result;
        
        switch (operation) {
          case 'uppercase':
            result = text.toUpperCase();
            break;
          case 'lowercase':
            result = text.toLowerCase();
            break;
          case 'title':
            result = text.replace(/\w\S*/g, (txt) => 
              txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
            );
            break;
          case 'reverse':
            result = text.split('').reverse().join('');
            break;
          case 'camel':
            result = text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
              index === 0 ? word.toLowerCase() : word.toUpperCase()
            ).replace(/\s+/g, '');
            break;
          default:
            throw new Error('Unknown operation');
        }
        
        ctx.log(`Transformed text using ${operation}`);
        
        return {
          original: text,
          transformed: result,
          operation: operation
        };
      }
    }
  ]
});
```

### Example 3: Data Conversion Extension

```javascript
const api = createChatExtensionAPI();

api.registerExtension({
  id: 'demo.convert',
  name: 'Data Conversion Tools',
  version: '1.0.0',
  description: 'Convert between different data formats',
  author: 'Demo Author',
  tools: [
    {
      name: 'json_to_csv',
      description: 'Convert JSON array to CSV format',
      inputSchema: {
        type: 'object',
        properties: {
          json_data: { 
            type: 'string', 
            description: 'JSON array as string (e.g., \'[{"name":"John","age":30}]\')' 
          },
          delimiter: { 
            type: 'string', 
            description: 'CSV delimiter (default: comma)',
            enum: [',', ';', '\\t', '|']
          }
        },
        required: ['json_data']
      },
      async call(args, ctx) {
        try {
          const data = JSON.parse(args.json_data);
          
          if (!Array.isArray(data) || data.length === 0) {
            throw new Error('JSON data must be a non-empty array');
          }
          
          const delimiter = args.delimiter || ',';
          const headers = Object.keys(data[0]);
          
          // Create CSV header
          let csv = headers.join(delimiter) + '\n';
          
          // Add data rows
          for (const row of data) {
            const values = headers.map(header => {
              const value = row[header];
              // Escape values that contain the delimiter
              if (typeof value === 'string' && value.includes(delimiter)) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value !== null && value !== undefined ? value : '';
            });
            csv += values.join(delimiter) + '\n';
          }
          
          ctx.log(`Converted ${data.length} records to CSV`);
          
          return {
            csv: csv,
            rows: data.length,
            columns: headers.length,
            delimiter: delimiter
          };
        } catch (error) {
          throw new Error('Invalid JSON data: ' + error.message);
        }
      }
    },
    {
      name: 'base64_encode',
      description: 'Encode text to base64 or decode base64 to text',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Text or base64 string' },
          operation: { 
            type: 'string', 
            enum: ['encode', 'decode'],
            description: 'Encode or decode operation' 
          }
        },
        required: ['data', 'operation']
      },
      async call(args, ctx) {
        const { data, operation } = args;
        let result;
        
        try {
          if (operation === 'encode') {
            result = btoa(unescape(encodeURIComponent(data)));
          } else {
            result = decodeURIComponent(escape(atob(data)));
          }
        } catch (error) {
          throw new Error(`Failed to ${operation} base64: ${error.message}`);
        }
        
        ctx.log(`${operation === 'encode' ? 'Encoded' : 'Decoded'} data (${data.length} chars)`);
        
        return {
          input: data,
          output: result,
          operation: operation,
          input_length: data.length,
          output_length: result.length
        };
      }
    }
  ]
});
```

## Best Practices

### 1. Error Handling

Always handle errors gracefully and provide meaningful error messages:

```javascript
async call(args, ctx) {
  try {
    // Your logic here
    if (!args.text) {
      throw new Error('Text parameter is required');
    }
    return { result: 'Success' };
  } catch (error) {
    ctx.error('Tool failed: ' + error.message);
    throw error; // Re-throw to show error to user
  }
}
```

### 2. Input Validation

Validate inputs early and provide clear error messages:

```javascript
async call(args, ctx) {
  const { number } = args;
  
  if (typeof number !== 'number') {
    throw new Error('Number parameter must be a number');
  }
  
  if (number < 0) {
    throw new Error('Number must be positive');
  }
  
  // Continue with valid input
}
```

### 3. Logging

Use the context logging methods for debugging:

```javascript
async call(args, ctx) {
  ctx.log('Starting tool execution');
  ctx.log(`Processing ${args.items.length} items`);
  
  // ... processing ...
  
  ctx.warn('Processing took longer than expected');
  ctx.log('Tool execution completed');
}
```

### 4. Return Format

Always return structured data:

```javascript
return {
  result: 'Main result',
  metadata: {
    processed: 10,
    duration: '2.5s',
    version: '1.0.0'
  }
};
```

## Limitations

### Restricted APIs

Extensions cannot access:
- Network requests (`fetch`, `XMLHttpRequest`)
- File system access
- Browser storage (`localStorage`, `sessionStorage`)
- Dangerous functions (`eval`, `Function` with code)
- DOM manipulation
- Web workers
- Crypto APIs

### Performance Limits

- Maximum execution time: 30 seconds
- Memory usage is limited
- No persistent storage between calls

### Safe Alternatives

Instead of restricted APIs, use:
- `ctx.log()` for logging
- `ctx.settings` for read-only app settings
- Built-in JavaScript functions for data processing
- Mathematical operations

## Installation

1. Open the chat application
2. Go to Settings > Extensions
3. Click "New Extension"
4. Fill in the extension details
5. Write your extension code
6. Click "Save Extension"

## Testing

Test your extensions thoroughly:

1. Create test cases for all input scenarios
2. Test error conditions
3. Verify output format
4. Check performance with large inputs
5. Test edge cases and boundary conditions

## Troubleshooting

### Common Issues

1. **Extension not loading**: Check for syntax errors in your code
2. **Tool not found**: Ensure tool names are unique within the extension
3. **Input validation errors**: Verify your input schema matches the actual parameters
4. **Timeout errors**: Optimize your code for performance

### Debugging

Use `ctx.log()` statements to debug your extension:

```javascript
ctx.log('Debug: Processing step 1');
ctx.log('Debug: Current value:', currentValue);
```

Check the browser console for extension logs and errors.

## Integration System

Extensions can also register external service integrations that allow the AI assistant to interact with third-party APIs and services.

### What are Integrations?

Integrations are connections to external services like GitHub, Slack, Notion, etc. They provide:
- **Authentication**: Handle API keys, OAuth tokens, and other credentials
- **API Clients**: Pre-built clients for common external services
- **Tools**: AI-callable functions that use the integration
- **UI Components**: Configuration interfaces in the settings panel

### Built-in GitHub Integration

The application includes a built-in GitHub integration that demonstrates the integration system:

#### Features:
- **PAT Token Authentication**: Secure Personal Access Token validation
- **Repository Access**: List, search, and view repositories
- **File Operations**: Read file contents and browse directory structures
- **Issue Management**: Access and manage repository issues

#### Available Tools:
- `github_list_repos`: List all repositories for the authenticated user
- `github_get_repo`: Get detailed information about a specific repository
- `github_list_files`: List files and directories in a repository
- `github_get_file`: Get the content of a specific file from a repository
- `github_search_repos`: Search for repositories based on criteria
- `github_get_issues`: Get issues from a repository

### Creating Custom Integrations

Extensions can register their own integrations using the integration registry:

```javascript
// Register a custom integration
api.registerIntegration({
  id: 'my-service',
  name: 'My Service',
  description: 'Connect to My Service API',
  icon: 'MS',
  authType: 'api_key',
  validateToken: async (token) => {
    // Validate the API key
    const response = await fetch('https://api.myservice.com/user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const user = await response.json();
      return { valid: true, username: user.name };
    }
    return { valid: false, error: 'Invalid API key' };
  },
  tools: [
    {
      name: 'myservice_get_data',
      label: 'Get Data',
      description: 'Retrieve data from My Service',
      requiresAuth: true,
      enabled: false,
      handler: async (settings, params) => {
        const apiKey = settings.integrations?.['my-service']?.apiKey;
        const response = await fetch('https://api.myservice.com/data', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return response.json();
      }
    }
  ]
});
```

### Integration Properties

#### IntegrationDefinition
```typescript
interface IntegrationDefinition {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description: string;           // User-facing description
  icon: string;                  // Icon/text for UI
  authType: 'api_key' | 'oauth' | 'none';  // Authentication type
  configureComponent?: React.ComponentType<any>;  // Custom UI component
  validateToken?: (token: string) => Promise<{ valid: boolean; username?: string; error?: string }>;
  tools: IntegrationTool[];      // Tools provided by this integration
}
```

#### IntegrationTool
```typescript
interface IntegrationTool {
  name: string;                  // Tool identifier
  label: string;                 // Display label
  description: string;            // Tool description
  requiresAuth: boolean;          // Whether authentication is required
  enabled: boolean;              // Whether tool is enabled
  handler?: (settings: AppSettings, ...args: any[]) => Promise<any>;  // Tool implementation
}
```

### Authentication Types

#### API Key Authentication
```javascript
authType: 'api_key',
validateToken: async (token) => {
  // Validate the API key
  const response = await fetch('https://api.example.com/validate', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.ok 
    ? { valid: true, username: 'user123' }
    : { valid: false, error: 'Invalid token' };
}
```

#### OAuth Authentication
```javascript
authType: 'oauth',
// OAuth flow is handled by the application
// Token is stored and validated automatically
```

#### No Authentication
```javascript
authType: 'none',
// No authentication required
// Tools are always enabled
```

### Settings Storage

Integration configurations are stored in the application settings:

```typescript
interface AppSettings {
  integrations?: {
    github?: {
      configured: boolean;
      patToken: string;
      username: string;
    };
    'my-service'?: {
      configured: boolean;
      apiKey: string;
      username: string;
    };
    // Extensions can add their own integrations
    [key: string]: any;
  };
}
```

### Best Practices

1. **Security**: Always validate tokens and handle errors gracefully
2. **Rate Limiting**: Respect API rate limits and implement caching
3. **Error Handling**: Provide clear error messages for users
4. **User Experience**: Show loading states and progress indicators
5. **Documentation**: Document your integration's API requirements

### Example: Slack Integration

```javascript
api.registerIntegration({
  id: 'slack',
  name: 'Slack',
  description: 'Send messages and notifications to Slack channels',
  icon: 'SL',
  authType: 'api_key',
  validateToken: async (token) => {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    return data.ok 
      ? { valid: true, username: data.user }
      : { valid: false, error: data.error };
  },
  tools: [
    {
      name: 'slack_send_message',
      label: 'Send Message',
      description: 'Send a message to a Slack channel',
      requiresAuth: true,
      enabled: false,
      handler: async (settings, channel, message) => {
        const token = settings.integrations?.slack?.apiKey;
        const response = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channel,
            text: message
          })
        });
        return response.json();
      }
    }
  ]
});
```

## Support

For help with extension development:

1. Check this documentation first
2. Look at example extensions
3. Check the browser console for errors
4. Review the extension source code for reference implementations
5. Test integrations thoroughly before deploying

Happy coding!
