import { defineTool } from '../types/tools';
import ChartTool from './chartTool';

export default defineTool(
  'chart',
  'Generate dynamic charts. Supports line, bar, pie, doughnut, radar, polarArea, bubble, and scatter charts. Returns a markdown code block that renders as an interactive chart.',
  {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Chart type to generate',
        enum: ['line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter']
      },
      labels: {
        type: 'array',
        description: 'Labels for the data points (required for most charts except scatter)',
        items: { type: 'string' }
      },
      data: {
        type: 'array',
        description: 'Chart data - format depends on chart type: numbers for pie/doughnut, {label, data[], color?}[] for line/bar/radar, {x, y}[] for scatter',
        items: { type: 'object' }
      },
      title: {
        type: 'string',
        description: 'Chart title (optional)'
      },
      xAxisLabel: {
        type: 'string',
        description: 'X-axis label (optional, for line/bar charts)'
      },
      yAxisLabel: {
        type: 'string',
        description: 'Y-axis label (optional, for line/bar charts)'
      },
      colors: {
        type: 'array',
        description: 'Custom colors array (optional, for pie/doughnut charts)',
        items: { type: 'string' }
      }
    },
    required: ['type', 'data']
  },
  async (args) => {
    try {
      const { type, labels, data, title, xAxisLabel, yAxisLabel, colors } = args;
      
      // Validate required parameters based on chart type
      if (type === 'scatter') {
        if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object' || !('x' in data[0]) || !('y' in data[0])) {
          throw new Error('Scatter charts require an array of {x, y} objects');
        }
        return ChartTool.createScatterChart(data, title);
      }
      
      if (type === 'pie' || type === 'doughnut') {
        if (!labels || !Array.isArray(labels)) {
          throw new Error(`${type} charts require labels array`);
        }
        if (!Array.isArray(data) || typeof data[0] !== 'number') {
          throw new Error(`${type} charts require a data array of numbers`);
        }
        return type === 'pie' 
          ? ChartTool.createPieChart(labels, data, title, colors)
          : ChartTool.createDoughnutChart(labels, data, title, colors);
      }
      
      if (['line', 'bar', 'radar'].includes(type)) {
        if (!labels || !Array.isArray(labels)) {
          throw new Error(`${type} charts require labels array`);
        }
        if (!Array.isArray(data) || typeof data[0] !== 'object' || !('label' in data[0]) || !('data' in data[0])) {
          throw new Error(`${type} charts require a data array of datasets with label and data properties`);
        }
        
        const datasets = data as Array<{ label: string; data: number[]; color?: string }>;
        
        if (type === 'line') {
          return ChartTool.createLineChart(labels, datasets, title, xAxisLabel, yAxisLabel);
        } else if (type === 'bar') {
          return ChartTool.createBarChart(labels, datasets, title, xAxisLabel, yAxisLabel);
        } else if (type === 'radar') {
          return ChartTool.createRadarChart(labels, datasets, title);
        }
      }
      
      throw new Error(`Unsupported chart type: ${type}`);
    } catch (error) {
      throw new Error(`Failed to generate chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
