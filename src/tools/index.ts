import { Tool } from '../types/tools';
import getCurrentTime from './getCurrentTime';
import calculate from './calculate';
import generateImage from './generateImage';
import googleSearch from './googleSearch';
import amazonSearch from './amazonSearch';
import citySearch from './citySearch';
import hotelSearchTools from './hotelSearch';
import webRequest from './webRequest';
import devEnvTools from './devEnv';
import qanda from './qanda';
import localAgentTools from './localAgent';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
  googleSearch,
  amazonSearch,
  citySearch,
  ...hotelSearchTools,
  webRequest,
  qanda,
  ...devEnvTools,
  ...localAgentTools,
];

export function getAllTools(includeImageGen = false): Tool[] {
  const settingsData = localStorage.getItem('lumina_settings');
  let localAgentEnabled = false;
  let disabledTools: string[] = [];
  
  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      localAgentEnabled = settings.localAgent?.enabled || false;
      disabledTools = settings.disabledTools || [];
    } catch {}
  }

  const baseTools = includeImageGen ? [...tools.filter(t => !t.definition.function.name.startsWith('local_agent_')), generateImage] : tools.filter(t => !t.definition.function.name.startsWith('local_agent_'));
  
  const filteredTools = baseTools.filter(t => !disabledTools.includes(t.definition.function.name));

  if (localAgentEnabled) {
    return [...filteredTools, ...localAgentTools.filter(t => !disabledTools.includes(t.definition.function.name))];
  }
  
  return filteredTools;
}

export function getToolByName(name: string): Tool | undefined {
  const settingsData = localStorage.getItem('lumina_settings');
  let localAgentEnabled = false;
  let disabledTools: string[] = [];
  
  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      localAgentEnabled = settings.localAgent?.enabled || false;
      disabledTools = settings.disabledTools || [];
    } catch {}
  }

  if (disabledTools.includes(name)) return undefined;

  const allTools = [...tools, generateImage];
  
  if (name.startsWith('local_agent_') && !localAgentEnabled) {
    return undefined;
  }
  
  const found = allTools.find(t => t.definition.function.name === name);
  if (!found) return undefined;

  // Wrap execute to yield to the event loop first so React can flush
  // the loading state to the DOM before the tool starts running
  return {
    ...found,
    execute: (args: any) => new Promise((resolve, reject) => {
      setTimeout(() => found.execute(args).then(resolve).catch(reject), 0);
    }),
  };
}

export function getToolDefinitions(includeImageGen = false) {
  return getAllTools(includeImageGen).map(t => t.definition);
}

export function getToolDefinitionsForResponsesApi(includeImageGen = false) {
  const tools = getAllTools(includeImageGen).map(t => ({
    type: 'function',
    name: t.definition.function.name,
    description: t.definition.function.description,
    parameters: t.definition.function.parameters,
  }));
  
  // Add built-in image generation tool for responses API
  if (includeImageGen) {
    const settingsData = localStorage.getItem('lumina_settings');
    let imageModel = 'gpt-image-1';
    
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData);
        imageModel = settings.imageGenerationModel || 'gpt-image-1';
      } catch {}
    }
    
    tools.push({
      type: 'image_generation',
      model: imageModel,
      size: '1024x1024'
    } as any);
  }
  
  return tools;
}
