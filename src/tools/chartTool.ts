interface ChartToolConfig {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'polarArea' | 'bubble' | 'scatter';
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[] | Array<{ x: number; y: number }>;
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
      fill?: boolean;
      tension?: number;
    }>;
  };
  options?: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    plugins?: {
      title?: {
        display: boolean;
        text: string;
      };
      legend?: {
        display: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
    };
    scales?: {
      x?: {
        display: boolean;
        title?: {
          display: boolean;
          text: string;
        };
        beginAtZero?: boolean;
      };
      y?: {
        display: boolean;
        title?: {
          display: boolean;
          text: string;
        };
        beginAtZero?: boolean;
      };
    };
  };
  width?: number;
  height?: number;
}

export class ChartTool {
  static generateChart(config: ChartToolConfig): string {
    return `\`\`\`chart
${JSON.stringify(config, null, 2)}
\`\`\``;
  }

  static createLineChart(
    labels: string[],
    datasets: Array<{ label: string; data: number[]; color?: string }>,
    title?: string,
    xAxisLabel?: string,
    yAxisLabel?: string
  ): string {
    const config: ChartToolConfig = {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(dataset => ({
          label: dataset.label,
          data: dataset.data,
          borderColor: dataset.color || 'rgba(54, 162, 235, 1)',
          backgroundColor: dataset.color ? dataset.color.replace('1)', '0.2)') : 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          fill: false,
          tension: 0.1
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: title ? { display: true, text: title } : undefined,
          legend: { display: true, position: 'top' }
        },
        scales: {
          x: {
            display: true,
            title: xAxisLabel ? { display: true, text: xAxisLabel } : undefined
          },
          y: {
            display: true,
            title: yAxisLabel ? { display: true, text: yAxisLabel } : undefined,
            beginAtZero: true
          }
        }
      }
    };

    return this.generateChart(config);
  }

  static createBarChart(
    labels: string[],
    datasets: Array<{ label: string; data: number[]; color?: string }>,
    title?: string,
    xAxisLabel?: string,
    yAxisLabel?: string
  ): string {
    const config: ChartToolConfig = {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map(dataset => ({
          label: dataset.label,
          data: dataset.data,
          backgroundColor: dataset.color || 'rgba(54, 162, 235, 0.5)',
          borderColor: dataset.color ? dataset.color.replace('0.5)', '1)') : 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: title ? { display: true, text: title } : undefined,
          legend: { display: true, position: 'top' }
        },
        scales: {
          x: {
            display: true,
            title: xAxisLabel ? { display: true, text: xAxisLabel } : undefined
          },
          y: {
            display: true,
            title: yAxisLabel ? { display: true, text: yAxisLabel } : undefined,
            beginAtZero: true
          }
        }
      }
    };

    return this.generateChart(config);
  }

  static createPieChart(
    labels: string[],
    data: number[],
    title?: string,
    colors?: string[]
  ): string {
    const defaultColors = [
      'rgba(255, 99, 132, 0.5)',
      'rgba(54, 162, 235, 0.5)',
      'rgba(255, 206, 86, 0.5)',
      'rgba(75, 192, 192, 0.5)',
      'rgba(153, 102, 255, 0.5)',
      'rgba(255, 159, 64, 0.5)'
    ];

    const config: ChartToolConfig = {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          label: 'Dataset',
          data,
          backgroundColor: colors || defaultColors.slice(0, data.length),
          borderColor: colors ? colors.map(c => c.replace('0.5)', '1)')) : defaultColors.slice(0, data.length).map(c => c.replace('0.5)', '1)')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: title ? { display: true, text: title } : undefined,
          legend: { display: true, position: 'right' }
        }
      }
    };

    return this.generateChart(config);
  }

  static createDoughnutChart(
    labels: string[],
    data: number[],
    title?: string,
    colors?: string[]
  ): string {
    const defaultColors = [
      'rgba(255, 99, 132, 0.5)',
      'rgba(54, 162, 235, 0.5)',
      'rgba(255, 206, 86, 0.5)',
      'rgba(75, 192, 192, 0.5)',
      'rgba(153, 102, 255, 0.5)',
      'rgba(255, 159, 64, 0.5)'
    ];

    const config: ChartToolConfig = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          label: 'Dataset',
          data,
          backgroundColor: colors || defaultColors.slice(0, data.length),
          borderColor: colors ? colors.map(c => c.replace('0.5)', '1)')) : defaultColors.slice(0, data.length).map(c => c.replace('0.5)', '1)')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: title ? { display: true, text: title } : undefined,
          legend: { display: true, position: 'right' }
        }
      }
    };

    return this.generateChart(config);
  }

  static createRadarChart(
    labels: string[],
    datasets: Array<{ label: string; data: number[]; color?: string }>,
    title?: string
  ): string {
    const config: ChartToolConfig = {
      type: 'radar',
      data: {
        labels,
        datasets: datasets.map(dataset => ({
          label: dataset.label,
          data: dataset.data,
          borderColor: dataset.color || 'rgba(54, 162, 235, 1)',
          backgroundColor: dataset.color ? dataset.color.replace('1)', '0.2)') : 'rgba(54, 162, 235, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: dataset.color || 'rgba(54, 162, 235, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: dataset.color || 'rgba(54, 162, 235, 1)'
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: title ? { display: true, text: title } : undefined,
          legend: { display: true, position: 'top' }
        }
      }
    };

    return this.generateChart(config);
  }

  static createScatterChart(
    data: Array<{ x: number; y: number }>,
    title?: string,
    color?: string
  ): string {
    const config: ChartToolConfig = {
      type: 'scatter',
      data: {
        labels: [],
        datasets: [{
          label: 'Dataset',
          data: data as any, // Scatter chart data format is different
          backgroundColor: color || 'rgba(54, 162, 235, 0.5)',
          borderColor: color ? color.replace('0.5)', '1)') : 'rgba(54, 162, 235, 1)',
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
            title: { display: true, text: 'X Axis' },
            beginAtZero: false
          },
          y: {
            display: true,
            title: { display: true, text: 'Y Axis' },
            beginAtZero: true
          }
        }
      }
    };

    return this.generateChart(config);
  }
}

// Helper function to create charts from simple data
export function createChart(
  type: ChartToolConfig['type'],
  labels: string[],
  data: number[] | Array<{ label: string; data: number[]; color?: string }> | Array<{ x: number; y: number }>,
  title?: string,
  options?: Partial<ChartToolConfig['options']>
): string {
  switch (type) {
    case 'line':
    case 'bar':
      if (Array.isArray(data) && typeof data[0] === 'object' && 'label' in data[0]) {
        const datasets = data as Array<{ label: string; data: number[]; color?: string }>;
        return type === 'line' 
          ? ChartTool.createLineChart(labels, datasets, title, options?.scales?.x?.title?.text, options?.scales?.y?.title?.text)
          : ChartTool.createBarChart(labels, datasets, title, options?.scales?.x?.title?.text, options?.scales?.y?.title?.text);
      }
      throw new Error('Line and bar charts require array of datasets with label and data');
    
    case 'pie':
    case 'doughnut':
      if (Array.isArray(data) && typeof data[0] === 'number') {
        return type === 'pie'
          ? ChartTool.createPieChart(labels, data as number[], title)
          : ChartTool.createDoughnutChart(labels, data as number[], title);
      }
      throw new Error('Pie and doughnut charts require array of numbers');
    
    case 'radar':
      if (Array.isArray(data) && typeof data[0] === 'object' && 'label' in data[0]) {
        const datasets = data as Array<{ label: string; data: number[]; color?: string }>;
        return ChartTool.createRadarChart(labels, datasets, title);
      }
      throw new Error('Radar chart requires array of datasets with label and data');
    
    case 'scatter':
      if (Array.isArray(data) && typeof data[0] === 'object' && 'x' in data[0] && 'y' in data[0]) {
        return ChartTool.createScatterChart(data as Array<{ x: number; y: number }>, title);
      }
      throw new Error('Scatter chart requires array of {x, y} objects');
    
    default:
      throw new Error(`Unsupported chart type: ${type}`);
  }
}

export default ChartTool;
