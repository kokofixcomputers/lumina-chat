import { Tool } from '../types/tools';
import getCurrentTime from './getCurrentTime';
import calculate from './calculate';
import googleSearch from './googleSearch';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
  googleSearch,
];

export function getAllTools(): Tool[] {
  return tools;
}

export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.definition.function.name === name);
}

export function getToolDefinitions() {
  return tools.map(t => t.definition);
}
