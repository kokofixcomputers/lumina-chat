import { Tool } from '../types/tools';
import getCurrentTime from './getCurrentTime';
import calculate from './calculate';

const tools: Tool[] = [
  getCurrentTime,
  calculate,
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
