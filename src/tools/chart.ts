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
        // Parse data if it's a string
        let parsedData = data;
        if (typeof data === 'string') {
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            throw new Error('Invalid JSON data format');
          }
        }
        
        // Check if data is in simple format [{x, y}, ...] or full Chart.js format {datasets: [...]}
        if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'object' && 'x' in parsedData[0] && 'y' in parsedData[0]) {
          // Simple format: [{x, y}, ...]
          return ChartTool.createScatterChart(parsedData, title);
        } else if (typeof parsedData === 'object' && 'datasets' in parsedData) {
          // Full Chart.js format - return as-is
          return ChartTool.generateChart({
            type: 'scatter',
            data: parsedData as any,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: title ? { display: true, text: title } : undefined,
                legend: { display: false }
              },
              scales: {
                x: {
                  display: true,
                  title: { display: true, text: xAxisLabel || 'X Axis' }
                },
                y: {
                  display: true,
                  title: { display: true, text: yAxisLabel || 'Y Axis' },
                  beginAtZero: true
                }
              }
            }
          });
        } else {
          throw new Error(`Scatter charts require either an array of {x, y} objects or a Chart.js datasets object. Received: ${JSON.stringify(parsedData)}`);
        }
      }
      
      // Parse data if it's a string (apply to all chart types)
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          // If parsing fails, continue with original data
        }
      }
      
      if (type === 'pie' || type === 'doughnut') {
        // Check if data is in simple format (numbers array) or full Chart.js format
        if (typeof parsedData === 'object' && 'datasets' in parsedData) {
          // Full Chart.js format - return as-is
          return ChartTool.generateChart({
            type: type as 'pie' | 'doughnut',
            data: parsedData as any,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: title ? { display: true, text: title } : undefined,
                legend: { display: true, position: 'right' }
              }
            }
          });
        } else {
          // Simple format
          if (!labels || !Array.isArray(labels)) {
            throw new Error(`${type} charts require labels array`);
          }
          if (!Array.isArray(parsedData) || typeof parsedData[0] !== 'number') {
            throw new Error(`${type} charts require a data array of numbers`);
          }
          return type === 'pie' 
            ? ChartTool.createPieChart(labels, parsedData, title, colors)
            : ChartTool.createDoughnutChart(labels, parsedData, title, colors);
        }
      }
      
      if (['line', 'bar', 'radar'].includes(type)) {
        // Check if data is in simple format (datasets array) or full Chart.js format
        if (typeof parsedData === 'object' && 'datasets' in parsedData) {
          // Full Chart.js format - return as-is
          return ChartTool.generateChart({
            type: type as 'line' | 'bar' | 'radar',
            data: parsedData as any,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: title ? { display: true, text: title } : undefined,
                legend: { display: true, position: 'top' }
              },
              scales: type === 'radar' ? undefined : {
                x: {
                  display: true,
                  title: { display: true, text: xAxisLabel || 'X Axis' }
                },
                y: {
                  display: true,
                  title: { display: true, text: yAxisLabel || 'Y Axis' },
                  beginAtZero: true
                }
              }
            }
          });
        } else {
          // Simple format
          if (!labels || !Array.isArray(labels)) {
            throw new Error(`${type} charts require labels array`);
          }
          if (!Array.isArray(parsedData) || typeof parsedData[0] !== 'object' || !('label' in parsedData[0]) || !('data' in parsedData[0])) {
            throw new Error(`${type} charts require a data array of datasets with label and data properties`);
          }
          
          const datasets = parsedData as Array<{ label: string; data: number[]; color?: string }>;
          
          if (type === 'line') {
            return ChartTool.createLineChart(labels, datasets, title, xAxisLabel, yAxisLabel);
          } else if (type === 'bar') {
            return ChartTool.createBarChart(labels, datasets, title, xAxisLabel, yAxisLabel);
          } else if (type === 'radar') {
            return ChartTool.createRadarChart(labels, datasets, title);
          }
        }
      }
      
      throw new Error(`Unsupported chart type: ${type}`);
    } catch (error) {
      throw new Error(`Failed to generate chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
