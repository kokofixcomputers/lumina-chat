import { Tool } from '../types/tools';
import getCurrentTime from './getCurrentTime';
import calculate from './calculate';
import generateImage from './generateImage';
import googleSearch from './googleSearch';
import devEnvTools from './devEnv';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
  googleSearch,
  ...devEnvTools,
];

export function getAllTools(includeImageGen = false): Tool[] {
  return includeImageGen ? [...tools, generateImage] : tools;
}

export function getToolByName(name: string): Tool | undefined {
  return [...tools, generateImage].find(t => t.definition.function.name === name);
}

export function getToolDefinitions(includeImageGen = false) {
  return getAllTools(includeImageGen).map(t => t.definition);
}
