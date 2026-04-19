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
import { buildFsTools } from './buildFs';
import { memoryTools } from './memories';
import chart from './chart';
import { execPythonTool } from './execPython';

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
  execPythonTool,
  ...devEnvTools,
  ...localAgentTools,
];

export function getAllTools(includeImageGen = false, buildMode = false): Tool[] {
  const settingsData = localStorage.getItem('lumina_settings');
  let localAgentEnabled = false;
  let disabledTools: string[] = [];
  let memoriesEnabled = false;

  if (settingsData) {
    try {
      const settings = JSON.parse(settingsData);
      localAgentEnabled = settings.localAgent?.enabled || false;
      disabledTools = settings.disabledTools || [];
      memoriesEnabled = settings.memoriesEnabled || false;
    } catch {}
  }

  const baseTools = includeImageGen
    ? [...tools.filter(t => !t.definition.function.name.startsWith('local_agent_')), generateImage]
    : tools.filter(t => !t.definition.function.name.startsWith('local_agent_'));

  const withBuild = buildMode ? [...baseTools, ...buildFsTools] : baseTools;
  const withMemory = memoriesEnabled ? [...withBuild, ...memoryTools] : withBuild;
  const filteredTools = withMemory.filter(t => !disabledTools.includes(t.definition.function.name));

  if (localAgentEnabled) {
    return [...filteredTools, ...localAgentTools.filter(t => !disabledTools.includes(t.definition.function.name))];
  }

  return filteredTools;
}

export function getToolByName(name: string, buildMode = false): Tool | undefined {
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

  const allTools = [...tools, generateImage, ...(buildMode ? buildFsTools : []), ...memoryTools];

  if (name.startsWith('local_agent_') && !localAgentEnabled) return undefined;

  const found = allTools.find(t => t.definition.function.name === name);
  if (!found) return undefined;

  return {
    ...found,
    execute: (args: any) => new Promise((resolve, reject) => {
      setTimeout(() => found.execute(args).then(resolve).catch(reject), 0);
    }),
  };
}

export function getToolDefinitions(includeImageGen = false, buildMode = false) {
  return getAllTools(includeImageGen, buildMode).map(t => t.definition);
}

export function getToolDefinitionsForResponsesApi(includeImageGen = false, buildMode = false) {
  const toolList = getAllTools(includeImageGen, buildMode).map(t => ({
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
