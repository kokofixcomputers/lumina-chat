import { defineTool } from '../types/tools';

let wsConnection: WebSocket | null = null;
let connectionPromise: Promise<WebSocket> | null = null;
let messageHandlers: Map<string, (data: any) => void> = new Map();
let messageIdCounter = 0;

function getAgentConfig() {
  const settingsData = localStorage.getItem('lumina_settings');
  let agentConfig = { enabled: false, port: '14345', protocol: 'ws' };
  
  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      agentConfig = settings.localAgent || agentConfig;
    } catch {}
  }

  if (!agentConfig.enabled) {
    throw new Error('Local agent is not enabled. Please enable it in Settings > Local Agent');
  }

  return agentConfig;
}

function connectToAgent(): Promise<WebSocket> {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return Promise.resolve(wsConnection);
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const agentConfig = getAgentConfig();
  const wsUrl = `${agentConfig.protocol}://localhost:${agentConfig.port}`;

  connectionPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      connectionPromise = null;
      reject(new Error('Connection timeout'));
    }, 10000);

    ws.onopen = () => {
      clearTimeout(timeout);
      wsConnection = ws;
      connectionPromise = null;
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        const messageId = response.messageId;
        if (messageId && messageHandlers.has(messageId)) {
          const handler = messageHandlers.get(messageId);
          messageHandlers.delete(messageId);
          handler!(response);
        }
      } catch (err) {
        console.error('Failed to parse agent response:', err);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      wsConnection = null;
      connectionPromise = null;
      reject(new Error('Failed to connect to local agent'));
    };

    ws.onclose = () => {
      wsConnection = null;
      connectionPromise = null;
    };
  });

  return connectionPromise;
}

async function sendAgentCommand(action: string, params: any) {
  const ws = await connectToAgent();
  const messageId = `msg_${++messageIdCounter}_${Date.now()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      messageHandlers.delete(messageId);
      reject(new Error('Command timeout'));
    }, 30000);

    messageHandlers.set(messageId, (response) => {
      clearTimeout(timeout);
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });

    ws.send(JSON.stringify({ messageId, action, ...params }));
  });
}

const listDir = defineTool(
  'local_agent_list_dir',
  'List files and directories on the user\'s computer (NOT a VM). Use this to explore the file system.',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (e.g., ".", "/home/user", "C:\\Users")'
      }
    },
    required: ['path']
  },
  async (args: { path: string }) => {
    const result = await sendAgentCommand('list_dir', { path: args.path });
    return result;
  }
);

const readFile = defineTool(
  'local_agent_read_file',
  'Read file content from the user\'s computer (NOT a VM). Use this to view file contents.',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to read (e.g., "main.py", "/home/user/config.json")'
      }
    },
    required: ['path']
  },
  async (args: { path: string }) => {
    const result = await sendAgentCommand('read_file', { path: args.path });
    return result;
  }
);

const writeFile = defineTool(
  'local_agent_write_file',
  'Write complete file content on the user\'s computer (NOT a VM). This completely rewrites the file.',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to write'
      },
      content: {
        type: 'string',
        description: 'Complete file content to write'
      }
    },
    required: ['path', 'content']
  },
  async (args: { path: string; content: string }) => {
    const result = await sendAgentCommand('write_file', { path: args.path, content: args.content });
    return result;
  }
);

const replaceText = defineTool(
  'local_agent_replace_text',
  'Find and replace ALL occurrences of text in a file on the user\'s computer (NOT a VM).',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to modify'
      },
      find: {
        type: 'string',
        description: 'Text to find'
      },
      replace: {
        type: 'string',
        description: 'Text to replace with'
      }
    },
    required: ['path', 'find', 'replace']
  },
  async (args: { path: string; find: string; replace: string }) => {
    const result = await sendAgentCommand('replace_text', { path: args.path, find: args.find, replace: args.replace });
    return result;
  }
);

const rewriteFile = defineTool(
  'local_agent_rewrite_file',
  'Rewrite file with automatic backup on the user\'s computer (NOT a VM). Creates a backup before rewriting.',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path to rewrite'
      },
      content: {
        type: 'string',
        description: 'New complete file content'
      }
    },
    required: ['path', 'content']
  },
  async (args: { path: string; content: string }) => {
    const result = await sendAgentCommand('rewrite_file', { path: args.path, content: args.content });
    return result;
  }
);

const createDir = defineTool(
  'local_agent_create_dir',
  'Create a directory on the user\'s computer (NOT a VM). Creates parent directories if needed.',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to create (e.g., "src/utils", "/home/user/projects")'
      }
    },
    required: ['path']
  },
  async (args: { path: string }) => {
    const result = await sendAgentCommand('create_dir', { path: args.path });
    return result;
  }
);

const deleteItem = defineTool(
  'local_agent_delete',
  'Delete a file or directory on the user\'s computer (NOT a VM). Use with caution!',
  {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory path to delete'
      }
    },
    required: ['path']
  },
  async (args: { path: string }) => {
    const result = await sendAgentCommand('delete', { path: args.path });
    return result;
  }
);

const execute = defineTool(
  'local_agent_execute',
  'Execute a shell command on the user\'s computer (NOT a VM). Returns stdout, stderr, and exit code.',
  {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute (e.g., "python main.py", "npm install")'
      }
    },
    required: ['command']
  },
  async (args: { command: string }) => {
    const result = await sendAgentCommand('execute', { command: args.command });
    return result;
  }
);

const getCwd = defineTool(
  'local_agent_get_cwd',
  'Get the current working directory of the local agent on the user\'s computer (NOT a VM).',
  {
    type: 'object',
    properties: {}
  },
  async () => {
    const result = await sendAgentCommand('get_cwd', {});
    return result;
  }
);

export default [
  listDir,
  readFile,
  writeFile,
  replaceText,
  rewriteFile,
  createDir,
  deleteItem,
  execute,
  getCwd
];
