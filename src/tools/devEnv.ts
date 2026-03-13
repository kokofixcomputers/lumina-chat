import { defineTool } from '../types/tools';

let ws: WebSocket | null = null;

function getSettings() {
  const settings = JSON.parse(localStorage.getItem('lumina_settings') || '{}');
  return {
    wsUrl: settings.devEnv?.address || 'ws://localhost:8765',
    apiKey: settings.devEnv?.apiKey || 'kk_your_api_key_here',
    toolsEnabled: {
      createDevEnv: settings.devEnv?.tools?.createDevEnv ?? true,
      commandDevEnv: settings.devEnv?.tools?.commandDevEnv ?? true,
      artifactDevEnv: settings.devEnv?.tools?.artifactDevEnv ?? true,
    }
  };
}

function getCurrentConversation() {
  const conversations = JSON.parse(localStorage.getItem('lumina_conversations') || '[]');
  const activeConvId = sessionStorage.getItem('activeConvId');
  return conversations.find((c: any) => c.id === activeConvId);
}

function connectWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const { wsUrl } = getSettings();
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      resolve(ws!);
    };

    ws.onerror = (error) => {
      reject(error);
    };
  });
}

function sendMessage(message: any): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const socket = await connectWebSocket();
      
      const messageHandler = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);
          resolve(response);
          socket.removeEventListener('message', messageHandler);
        } catch (error) {
          reject(error);
        }
      };

      socket.addEventListener('message', messageHandler);
      socket.send(JSON.stringify(message));

      setTimeout(() => {
        socket.removeEventListener('message', messageHandler);
        reject(new Error('WebSocket timeout'));
      }, 30000);
    } catch (error) {
      reject(error);
    }
  });
}

export const createDevEnv = defineTool(
  'create_dev_env',
  'Creates an Alpine Linux environment in Docker to execute and run commands in. Use command_dev_env to execute commands in the environment, the user does not have access to this env.',
  {
    type: 'object',
    properties: {}
  },
  async () => {
    const { toolsEnabled } = getSettings();
    if (!toolsEnabled.createDevEnv) {
      return {
        success: false,
        error: 'create_dev_env tool is disabled in settings'
      };
    }

    try {
      const { apiKey } = getSettings();
      
      // Always create new session
      const response = await sendMessage({
        task: 'create',
        api_key: apiKey
      });

      if (response.type === 'update' && response.session) {
        const sessionId = response.session;
        
        // Wait for "done" status
        if (response.status !== 'done') {
          await new Promise((resolve) => {
            const checkStatus = (event: MessageEvent) => {
              const update = JSON.parse(event.data);
              if (update.type === 'update' && update.status === 'done') {
                ws?.removeEventListener('message', checkStatus);
                resolve(update);
              }
            };
            ws?.addEventListener('message', checkStatus);
          });
        }

        return {
          success: true,
          session: sessionId,
          status: 'Environment created successfully'
        };
      }

      return {
        success: false,
        error: 'Failed to create environment'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

export const commandDevEnv = defineTool(
  'command_dev_env',
  'Run an Alpine Linux command in the dev environment. Note: Directory resets after each command, so use "cd dir; command" format for multi-step operations',
  {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute. Use "cd dir; command" format if you need to change directory'
      }
    },
    required: ['command']
  },
  async (args: { command: string }) => {
    const { toolsEnabled } = getSettings();
    if (!toolsEnabled.commandDevEnv) {
      return {
        success: false,
        error: 'command_dev_env tool is disabled in settings'
      };
    }

    try {
      // Add small delay to ensure localStorage is updated from create_dev_env
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const conv = getCurrentConversation();
      const currentSession = conv?.devEnvSession;
      
      if (!currentSession) {
        return {
          success: false,
          error: 'No active session. Please create a dev environment first using create_dev_env'
        };
      }

      const { apiKey } = getSettings();
      
      // Check if WebSocket is not connected, try to rejoin
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        try {
          const joinResponse = await sendMessage({
            task: 'join',
            session: currentSession,
            api_key: apiKey
          });
          
          if (joinResponse.error || (joinResponse.type !== 'update' && joinResponse.type !== 'result')) {
            return {
              success: false,
              error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
              session_expired: true
            };
          }
        } catch (err) {
          return {
            success: false,
            error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
            session_expired: true
          };
        }
      }
      
      // Execute command
      const response = await sendMessage({
        task: 'command',
        session: currentSession,
        command: args.command,
        api_key: apiKey
      });

      if (response.type === 'result') {
        return {
          success: response.exit_code === 0,
          result: response.result,
          exit_code: response.exit_code,
          session: response.session
        };
      }
      
      // Check if session not found
      if (response.error && (response.error.includes('not found') || response.error.includes('session'))) {
        return {
          success: false,
          error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
          session_expired: true
        };
      }

      return {
        success: false,
        error: 'Unexpected response format'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

export const artifactDevEnv = defineTool(
  'artifact_dev_env',
  'Give the user access to a file from the dev environment. If the path is a directory, you must zip the folder then upload the zipped folder. Returns a download link for the file.',
  {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'The absolute path to the file or directory to download (e.g., "/test.txt" or "/myproject")'
      }
    },
    required: ['file']
  },
  async (args: { file: string }) => {
    const { toolsEnabled } = getSettings();
    if (!toolsEnabled.artifactDevEnv) {
      return {
        success: false,
        error: 'artifact_dev_env tool is disabled in settings'
      };
    }

    try {
      // Add small delay to ensure localStorage is updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const conv = getCurrentConversation();
      const currentSession = conv?.devEnvSession;
      
      if (!currentSession) {
        return {
          success: false,
          error: 'No active session. Please create a dev environment first using create_dev_env'
        };
      }

      const { apiKey } = getSettings();
      
      // Check if WebSocket is not connected, try to rejoin
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        try {
          const joinResponse = await sendMessage({
            task: 'join',
            session: currentSession,
            api_key: apiKey
          });
          
          if (joinResponse.error || (joinResponse.type !== 'update' && joinResponse.type !== 'result')) {
            return {
              success: false,
              error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
              session_expired: true
            };
          }
        } catch (err) {
          return {
            success: false,
            error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
            session_expired: true
          };
        }
      }
      
      // Request artifact
      const response = await sendMessage({
        task: 'artifact',
        session: currentSession,
        file: args.file,
        api_key: apiKey
      });

      if (response.type === 'artifact' && response.url) {
        return {
          success: true,
          file: args.file,
          url: response.url,
          direct_download: response.direct_download,
          original_path: response.original_path,
          file_hash: response.file_hash,
          message: response.message || `File ${args.file} is ready for download`,
          _isArtifact: true
        };
      }
      
      // Check if session not found
      if (response.error && (response.error.includes('not found') || response.error.includes('session'))) {
        return {
          success: false,
          error: 'Session died due to inactivity. Please create a new environment using create_dev_env',
          session_expired: true
        };
      }

      return {
        success: false,
        error: response.error || 'Failed to create artifact'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

export default [createDevEnv, commandDevEnv, artifactDevEnv];
