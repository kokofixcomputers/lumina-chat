import React, { memo, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  Filler
} from 'chart.js';
import {
  Line,
  Bar,
  Pie,
  Doughnut,
  Radar,
  PolarArea,
  Bubble,
  Scatter
} from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
  Filler
);

interface ChartData {
  labels?: string[];
  datasets: Array<{
    label: string;
    data: number[] | Array<{ x: number; y: number }> | Array<{ x: number; y: number; r: number }>;
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
    pointRadius?: number;
    pointHoverRadius?: number;
  }>;
}

interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'polarArea' | 'bubble' | 'scatter';
  data: ChartData;
  options?: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    plugins?: {
      title?: {
        display: boolean;
        text: string;
        color?: string;
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

interface ChartComponentProps {
  config: ChartConfig;
  className?: string;
}

const ChartComponent = memo(({ config, className = "" }: ChartComponentProps) => {
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      title: {
        display: config.options?.plugins?.title?.display || false,
        text: config.options?.plugins?.title?.text || '',
        color: config.options?.plugins?.title?.color || '#374151',
      },
      ...config.options?.plugins,
    },
    scales: config.type !== 'pie' && config.type !== 'doughnut' && config.type !== 'polarArea' && config.type !== 'radar' ? {
      x: {
        display: config.options?.scales?.x?.display !== false,
        title: {
          display: config.options?.scales?.x?.title?.display || false,
          text: config.options?.scales?.x?.title?.text || '',
        },
      },
      y: {
        display: config.options?.scales?.y?.display !== false,
        title: {
          display: config.options?.scales?.y?.title?.display || false,
          text: config.options?.scales?.y?.title?.text || '',
        },
        beginAtZero: config.options?.scales?.y?.beginAtZero !== false,
      },
      ...config.options?.scales,
    } : undefined,
    ...config.options,
  }), [config]);

  const chartData = useMemo(() => ({
    labels: config.data.labels || [],
    datasets: config.data.datasets.map(dataset => {
      // For bubble and scatter charts, don't override colors if they're already set
      const isBubbleOrScatter = config.type === 'bubble' || config.type === 'scatter';
      const hasCustomColors = dataset.backgroundColor || dataset.borderColor;
      
      return {
        ...dataset,
        backgroundColor: hasCustomColors ? dataset.backgroundColor : (
          isBubbleOrScatter ? 'rgba(54, 162, 235, 0.5)' : [
            'rgba(255, 99, 132, 0.5)',
            'rgba(54, 162, 235, 0.5)',
            'rgba(255, 206, 86, 0.5)',
            'rgba(75, 192, 192, 0.5)',
            'rgba(153, 102, 255, 0.5)',
            'rgba(255, 159, 64, 0.5)',
          ]
        ),
        borderColor: hasCustomColors ? dataset.borderColor : (
          isBubbleOrScatter ? 'rgba(54, 162, 235, 1)' : [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)',
          ]
        ),
        borderWidth: dataset.borderWidth || 1,
      };
    }),
  }), [config.data, config.type]);

  const renderChart = () => {
    const chartProps = {
      data: chartData,
      options: chartOptions,
      width: config.width,
      height: config.height,
    };

    switch (config.type) {
      case 'line':
        return <Line {...chartProps} />;
      case 'bar':
        return <Bar {...chartProps} />;
      case 'pie':
        return <Pie {...chartProps} />;
      case 'doughnut':
        return <Doughnut {...chartProps} />;
      case 'radar':
        return <Radar {...chartProps} />;
      case 'polarArea':
        return <PolarArea {...chartProps} />;
      case 'bubble':
        return <Bubble {...chartProps} />;
      case 'scatter':
        return <Scatter {...chartProps} />;
      default:
        return <Line {...chartProps} />;
    }
  };

  return (
    <div className={`chart-container ${className}`} style={{ width: config.width || '100%', height: config.height || '400px' }}>
      {renderChart()}
    </div>
  );
});

ChartComponent.displayName = 'ChartComponent';

export default ChartComponent;
