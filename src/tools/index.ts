import { Tool } from '../types/tools';
import getCurrentTime from './getCurrentTime';
import calculate from './calculate';
import generateImage from './generateImage';
import googleSearch from './googleSearch';
import webRequest from './webRequest';
import devEnvTools from './devEnv';
import qanda from './qanda';
import localAgentTools from './localAgent';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
  googleSearch,
  webRequest,
  qanda,
  ...devEnvTools,
  ...localAgentTools,
];

export function getAllTools(includeImageGen = false): Tool[] {
  const settingsData = localStorage.getItem('lumina_settings');
  let localAgentEnabled = false;
  
  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      localAgentEnabled = settings.localAgent?.enabled || false;
    } catch {}
  }

  const baseTools = includeImageGen ? [...tools.filter(t => !t.definition.function.name.startsWith('local_agent_')), generateImage] : tools.filter(t => !t.definition.function.name.startsWith('local_agent_'));
  
  if (localAgentEnabled) {
    return [...baseTools, ...localAgentTools];
  }
  
  return baseTools;
}

export function getToolByName(name: string): Tool | undefined {
  const settingsData = localStorage.getItem('lumina_settings');
  let localAgentEnabled = false;
  
  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      localAgentEnabled = settings.localAgent?.enabled || false;
    } catch {}
  }

  const allTools = [...tools, generateImage];
  
  // If looking for a local agent tool, check if it's enabled
  if (name.startsWith('local_agent_') && !localAgentEnabled) {
    return undefined;
  }
  
  return allTools.find(t => t.definition.function.name === name);
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
