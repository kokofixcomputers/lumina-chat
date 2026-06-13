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
import { memoryTools } from './memories';
import chart from './chart';
import presentation from './presentation';
import { execPythonTool } from './execPython';
import { extensionToolRegistry } from '../extensions/extensionToolRegistry';
import remotion from './remotion';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
  googleSearch,
  amazonSearch,
  citySearch,
  ...hotelSearchTools,
  webRequest,
  qanda,
  chart,
  presentation,
  execPythonTool,
  remotion,
  ...devEnvTools,
];

export function getAllTools(includeImageGen = false): Tool[] {
  const settingsData = localStorage.getItem('lumina_settings');
  let disabledTools: string[] = [];
  let memoriesEnabled = false;

  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      disabledTools = settings.disabledTools || [];
      memoriesEnabled = settings.memoriesEnabled || false;
    } catch {}
  }

  const extensionTools = extensionToolRegistry.getDynamicTools();
  let filteredTools = [...tools, ...extensionTools].filter(t => !disabledTools.includes(t.definition.function.name));

  if (!memoriesEnabled) {
    filteredTools = filteredTools.filter(t => !t.definition.function.name.startsWith('memory_'));
  }

  if (includeImageGen) {
    filteredTools.push(generateImage);
  }

  return filteredTools;
}

export function getToolByName(name: string): Tool | undefined {
  const settingsData = localStorage.getItem('lumina_settings');
  let disabledTools: string[] = [];

  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      disabledTools = settings.disabledTools || [];
    } catch {}
  }

  if (disabledTools.includes(name)) return undefined;

  const extensionTools = extensionToolRegistry.getDynamicTools();
  const allTools = [...tools, ...extensionTools, generateImage, ...memoryTools];

  const found = allTools.find(t => t.definition.function.name === name);
  if (!found) return undefined;

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
  const toolList = getAllTools(includeImageGen).map(t => ({
    type: 'function',
    name: t.definition.function.name,
    description: t.definition.function.description,
    parameters: t.definition.function.parameters,
  }));

  if (includeImageGen) {
    const settingsData = localStorage.getItem('lumina_settings');
    let imageModel = 'gpt-image-1';
    if (settingsData) {
      try {
        const settings = JSON.parse(settingsData);
        imageModel = settings.imageGenerationModel || 'gpt-image-1';
      } catch {}
    }
    toolList.push({ type: 'image_generation', model: imageModel, size: '1024x1024' } as any);
  }

  return toolList;
}
