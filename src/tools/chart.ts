import { defineTool } from '../types/tools';
import ChartTool from './chartTool';

export default defineTool(
  'chart',
  'Generate dynamic charts. Supports line, bar, pie, doughnut, radar, polarArea, bubble, and scatter charts. Returns a markdown code block that renders as an interactive chart.\n\nChart types and required data formats:\n- line/bar/radar: requires labels (string[]) and data (Array<{label: string, data: number[], color?: string}>)\n- pie/doughnut: requires labels (string[]) and data (number[]) \n- scatter: requires data (Array<{x: number, y: number}>) - no labels needed\n- bubble: requires data (Array<{x: number, y: number, r: number}>) - no labels needed. The charts will be automatically provided to the user, do not provide anything as it will cause duplicates',
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
        description: 'Labels for the data points (required for line, bar, radar, pie, doughnut charts; not used for scatter, bubble)',
        items: { type: 'string' }
      },
      data: {
        type: 'array',
        description: 'Chart data - format depends on chart type:\n• line/bar/radar: [{label: string, data: number[], color?: string}]\n• pie/doughnut: [number, number, ...]\n• scatter: [{x: number, y: number}]\n• bubble: [{x: number, y: number, r: number}]',
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
      let chartMarkdown: string;
      
      // Parse data if it's a string (apply to all chart types)
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          // If parsing fails, continue with original data
        }
      }
      
      // Validate required parameters based on chart type
      if (type === 'scatter' || type === 'bubble') {
        
        if (type === 'scatter') {
          // Check if data is in simple format [{x, y}, ...] or full Chart.js format {datasets: [...]}
          if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'object' && 'x' in parsedData[0] && 'y' in parsedData[0]) {
            // Simple format: [{x, y}, ...]
            chartMarkdown = ChartTool.createScatterChart(parsedData, title);
          } else if (typeof parsedData === 'object' && 'datasets' in parsedData) {
            // Full Chart.js format - return as-is
            chartMarkdown = ChartTool.generateChart({
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
            throw new Error(`SCATTER charts require data array of {x, y} objects (e.g., [{x: 10, y: 20}, {x: 15, y: 25}]). Received: ${JSON.stringify(parsedData)}`);
          }
        } else if (type === 'bubble') {
          // Bubble chart handling
          if (Array.isArray(parsedData) && parsedData.length > 0 && typeof parsedData[0] === 'object' && 'x' in parsedData[0] && 'y' in parsedData[0] && 'r' in parsedData[0]) {
            chartMarkdown = ChartTool.generateChart({
              type: 'bubble',
              data: {
                datasets: [{
                  label: 'Bubble Data',
                  data: parsedData,
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  borderColor: 'rgba(54, 162, 235, 1)',
                  borderWidth: 1
                }]
              },
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
                    title: { display: true, text: xAxisLabel || 'X Axis' },
                    beginAtZero: false
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
            throw new Error(`BUBBLE charts require data array of {x, y, r} objects (e.g., [{x: 10, y: 20, r: 5}]). Received: ${JSON.stringify(parsedData)}`);
          }
        }
      } else if (type === 'pie' || type === 'doughnut') {
        // Check if data is in simple format (numbers array) or full Chart.js format
        if (typeof parsedData === 'object' && 'datasets' in parsedData) {
          // Full Chart.js format - return as-is
          chartMarkdown = ChartTool.generateChart({
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
            throw new Error(`${type.toUpperCase()} charts require labels array (e.g., ["Q1", "Q2", "Q3"])`);
          }
          if (!Array.isArray(parsedData) || typeof parsedData[0] !== 'number') {
            throw new Error(`${type.toUpperCase()} charts require a data array of numbers (e.g., [10, 20, 30])`);
          }
          chartMarkdown = type === 'pie' 
            ? ChartTool.createPieChart(labels, parsedData, title, colors)
            : ChartTool.createDoughnutChart(labels, parsedData, title, colors);
        }
      } else if (['line', 'bar', 'radar'].includes(type)) {
        // Check if data is in simple format (datasets array) or full Chart.js format
        if (typeof parsedData === 'object' && 'datasets' in parsedData) {
          // Full Chart.js format - return as-is
          chartMarkdown = ChartTool.generateChart({
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
            throw new Error(`${type.toUpperCase()} charts require labels array (e.g., ["Jan", "Feb", "Mar"])`);
          }
          if (!Array.isArray(parsedData) || typeof parsedData[0] !== 'object' || !('label' in parsedData[0]) || !('data' in parsedData[0])) {
            throw new Error(`${type.toUpperCase()} charts require data array of datasets with label and data properties (e.g., [{label: "Sales", data: [100, 200, 150]}])`);
          }
          
          const datasets = parsedData as Array<{ label: string; data: number[]; color?: string }>;
          
          if (type === 'line') {
            chartMarkdown = ChartTool.createLineChart(labels, datasets, title, xAxisLabel, yAxisLabel);
          } else if (type === 'bar') {
            chartMarkdown = ChartTool.createBarChart(labels, datasets, title, xAxisLabel, yAxisLabel);
          } else if (type === 'radar') {
            chartMarkdown = ChartTool.createRadarChart(labels, datasets, title);
          } else {
            throw new Error(`Unsupported chart type: ${type}`);
          }
        }
      }
      
      // Return a simple message to the AI - the actual chart markdown will be injected automatically
      return "The result was automatically published to user";
    } catch (error) {
      throw new Error(`Failed to generate chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);
