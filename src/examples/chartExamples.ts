import ChartTool, { createChart } from '../tools/chartTool';

// Example chart configurations that can be used by the AI

export const chartExamples = {
  // Line chart example
  lineChart: ChartTool.createLineChart(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    [
      {
        label: 'Sales',
        data: [12, 19, 3, 5, 2, 3],
        color: 'rgba(54, 162, 235, 1)'
      },
      {
        label: 'Revenue',
        data: [15, 25, 8, 12, 6, 8],
        color: 'rgba(255, 99, 132, 1)'
      }
    ],
    'Monthly Sales and Revenue',
    'Month',
    'Amount ($)'
  ),

  // Bar chart example
  barChart: ChartTool.createBarChart(
    ['Product A', 'Product B', 'Product C', 'Product D', 'Product E'],
    [
      {
        label: 'Q1 Sales',
        data: [65, 59, 80, 81, 56],
        color: 'rgba(75, 192, 192, 1)'
      },
      {
        label: 'Q2 Sales',
        data: [45, 69, 70, 91, 66],
        color: 'rgba(153, 102, 255, 1)'
      }
    ],
    'Quarterly Product Sales',
    'Products',
    'Sales Units'
  ),

  // Pie chart example
  pieChart: ChartTool.createPieChart(
    ['Desktop', 'Mobile', 'Tablet', 'Smart TV', 'Wearable'],
    [45, 30, 15, 7, 3],
    'Device Usage Distribution'
  ),

  // Doughnut chart example
  doughnutChart: ChartTool.createDoughnutChart(
    ['Completed', 'In Progress', 'Pending', 'Cancelled'],
    [120, 45, 30, 15],
    'Project Status Overview'
  ),

  // Radar chart example
  radarChart: ChartTool.createRadarChart(
    ['Speed', 'Reliability', 'Comfort', 'Safety', 'Efficiency', 'Design'],
    [
      {
        label: 'Product A',
        data: [85, 90, 78, 92, 88, 82],
        color: 'rgba(255, 99, 132, 1)'
      },
      {
        label: 'Product B',
        data: [78, 85, 92, 80, 75, 88],
        color: 'rgba(54, 162, 235, 1)'
      }
    ],
    'Product Comparison'
  ),

  // Scatter chart example
  scatterChart: ChartTool.createScatterChart(
    [
      { x: 10, y: 20 },
      { x: 15, y: 35 },
      { x: 25, y: 45 },
      { x: 30, y: 30 },
      { x: 35, y: 55 },
      { x: 40, y: 40 },
      { x: 45, y: 60 },
      { x: 50, y: 50 }
    ],
    'Correlation Analysis',
    'rgba(75, 192, 192, 1)'
  ),

  // Bubble chart example
  bubbleChart: ChartTool.createBubbleChart(
    [
      { x: 10, y: 20, r: 5 },
      { x: 15, y: 35, r: 8 },
      { x: 25, y: 45, r: 12 },
      { x: 30, y: 30, r: 6 },
      { x: 35, y: 55, r: 10 },
      { x: 40, y: 40, r: 7 },
      { x: 45, y: 60, r: 15 },
      { x: 50, y: 50, r: 9 }
    ],
    'Bubble Size Analysis',
    'rgba(255, 99, 132, 1)'
  )
};

// Simple helper function examples for AI usage
export const quickChartExamples = {
  // Simple line chart
  simpleLine: () => createChart(
    'line',
    ['Jan', 'Feb', 'Mar', 'Apr'],
    [
      { label: 'Dataset 1', data: [10, 20, 15, 25], color: 'rgba(54, 162, 235, 1)' }
    ],
    'Simple Line Chart'
  ),

  // Simple bar chart
  simpleBar: () => createChart(
    'bar',
    ['A', 'B', 'C', 'D'],
    [
      { label: 'Values', data: [12, 19, 3, 5], color: 'rgba(255, 99, 132, 1)' }
    ],
    'Simple Bar Chart'
  ),

  // Simple pie chart
  simplePie: () => createChart(
    'pie',
    ['Category 1', 'Category 2', 'Category 3'],
    [30, 50, 20],
    'Simple Pie Chart'
  )
};

// Template for AI to generate charts
export const chartTemplate = {
  line: `Use this format for line charts:
\`\`\`chart
{
  "type": "line",
  "data": {
    "labels": ["Label1", "Label2", "Label3"],
    "datasets": [{
      "label": "Dataset Name",
      "data": [10, 20, 30],
      "borderColor": "rgba(54, 162, 235, 1)",
      "backgroundColor": "rgba(54, 162, 235, 0.2)",
      "tension": 0.1
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Chart Title"
      }
    }
  }
}
\`\`\``,

  bar: `Use this format for bar charts:
\`\`\`chart
{
  "type": "bar",
  "data": {
    "labels": ["Category1", "Category2", "Category3"],
    "datasets": [{
      "label": "Dataset Name",
      "data": [10, 20, 30],
      "backgroundColor": "rgba(54, 162, 235, 0.5)"
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Chart Title"
      }
    }
  }
}
\`\`\``,

  pie: `Use this format for pie charts:
\`\`\`chart
{
  "type": "pie",
  "data": {
    "labels": ["Slice1", "Slice2", "Slice3"],
    "datasets": [{
      "data": [30, 50, 20],
      "backgroundColor": ["rgba(255, 99, 132, 0.5)", "rgba(54, 162, 235, 0.5)", "rgba(255, 206, 86, 0.5)"]
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Chart Title"
      }
    }
  }
}
\`\`\``,

  bubble: `Use this format for bubble charts:
\`\`\`chart
{
  "type": "bubble",
  "data": {
    "datasets": [{
      "label": "Bubble Data",
      "data": [
        {"x": 10, "y": 20, "r": 5},
        {"x": 15, "y": 35, "r": 8},
        {"x": 25, "y": 45, "r": 12}
      ],
      "backgroundColor": "rgba(54, 162, 235, 0.5)",
      "borderColor": "rgba(54, 162, 235, 1)",
      "borderWidth": 1
    }]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "title": {
        "display": true,
        "text": "Chart Title"
      },
      "legend": {
        "display": false
      }
    },
    "scales": {
      "x": {
        "display": true,
        "title": {
          "display": true,
          "text": "X Axis"
        },
        "beginAtZero": false
      },
      "y": {
        "display": true,
        "title": {
          "display": true,
          "text": "Y Axis"
        },
        "beginAtZero": true
      }
    }
  }
}
\`\`\``
};

export default chartExamples;
