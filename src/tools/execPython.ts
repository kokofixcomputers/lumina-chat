import { loadPyodide, PyodideInterface } from 'pyodide';

// Global Pyodide instance to avoid re-initialization
let pyodideInstance: PyodideInterface | null = null;
let isInitializing = false;
let initializationPromise: Promise<PyodideInterface> | null = null;

/**
 * Initialize Pyodide only once and reuse the instance
 */
async function getPyodideInstance(): Promise<PyodideInterface> {
  // Return existing instance if already initialized
  if (pyodideInstance) {
    return pyodideInstance;
  }

  // If currently initializing, return the existing promise
  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  isInitializing = true;
  initializationPromise = (async () => {
    try {
      console.log('Initializing Pyodide...');
      const pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/'
      });
      
      // Load common packages that might be useful
      await pyodide.loadPackage(['numpy', 'pandas', 'matplotlib']);
      
      // Configure matplotlib to use non-interactive backend
      pyodide.runPython(`
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import io
import base64

# Store original functions
original_show = plt.show
original_savefig = plt.savefig

# Override plt.show() to generate plot image
def safe_show():
    try:
        # Create a buffer
        buf = io.BytesIO()
        
        # Save current figure to buffer
        original_savefig(buf, format='png', bbox_inches='tight')
        
        # Convert to base64
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        
        # Return the base64 string as a special marker
        print(f"[PLOT_BASE64:{img_base64}]")
        print(f"[PLOT_GENERATED:Success]")
        
    except Exception as e:
        print(f"[PLOT_ERROR:{str(e)}]")

plt.show = safe_show

# Override plt.savefig() to return base64 instead of saving
def safe_savefig(*args, **kwargs):
    try:
        # Create a buffer
        buf = io.BytesIO()
        kwargs['format'] = kwargs.get('format', 'png')
        kwargs['bbox_inches'] = kwargs.get('bbox_inches', 'tight')
        
        # Save to buffer
        original_savefig(buf, *args, **kwargs)
        
        # Convert to base64
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        
        # Return the base64 string as a special marker
        print(f"[PLOT_BASE64:{img_base64}]")
        print(f"[PLOT_GENERATED:Success]")
        
    except Exception as e:
        print(f"[PLOT_ERROR:{str(e)}]")
    
plt.savefig = safe_savefig

print("Matplotlib configured successfully")
      `);
      
      pyodideInstance = pyodide;
      console.log('Pyodide initialized successfully');
      return pyodide;
    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      isInitializing = false;
      initializationPromise = null;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initializationPromise;
}

/**
 * Execute Python code using Pyodide
 */
async function executePython(code: string): Promise<{ output: string; error?: string; plotImages?: string[] }> {
  try {
    const pyodide = await getPyodideInstance();
    
    // Setup output capture
    pyodide.runPython(`
import sys
from io import StringIO
import traceback

# Capture stdout and stderr
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = StringIO()
sys.stderr = StringIO()
    `);

    // Execute the user code
    let result;
    let executionError = null;
    
    try {
      result = pyodide.runPython(code);
    } catch (error) {
      executionError = error;
    }

    // Get all outputs
    const stdoutOutput = pyodide.runPython("sys.stdout.getvalue()");
    const stderrOutput = pyodide.runPython("sys.stderr.getvalue()");

    // Restore stdout/stderr
    pyodide.runPython(`
sys.stdout = old_stdout
sys.stderr = old_stderr
    `);

    // Handle execution errors
    if (executionError) {
      const errorMessage = executionError instanceof Error ? executionError.message : String(executionError);
      return {
        output: stdoutOutput || '',
        error: stderrOutput || errorMessage
      };
    }

    // Format the output and handle plot images
    let output = stdoutOutput || '';
    let plotImages: string[] = [];
    
    console.log('Raw stdout:', output);
    
    // Extract plot images from output
    const plotRegex = /\[PLOT_BASE64:([^\]]+)\]/g;
    let plotMatch;
    while ((plotMatch = plotRegex.exec(output)) !== null) {
      plotImages.push(plotMatch[1]);
      // Remove the plot marker from the output
      output = output.replace(plotMatch[0], '');
      console.log('Found plot image, length:', plotMatch[1].length);
    }
    
    console.log('Plot images found:', plotImages.length);
    
    // Clean up output
    output = output.trim();
    
    // Add the result if it's not None and meaningful
    if (result !== null && result !== undefined && result !== pyodide.globals.get('None')) {
      const resultStr = String(result);
      
      // Handle different result types
      if (resultStr && resultStr !== 'None') {
        // Check if it's a large object (like arrays, dataframes, etc.)
        if (resultStr.length > 200) {
          output += (output ? '\n\n' : '') + `Result:\n${resultStr.substring(0, 500)}${resultStr.length > 500 ? '...' : ''}`;
        } else if (!output.includes(resultStr)) {
          output += (output ? '\n' : '') + resultStr;
        }
      }
    }

    // If we have plot images, add them to the output as markdown
    if (plotImages.length > 0) {
      output += (output ? '\n\n' : '') + plotImages.map((img, index) => 
        `![Plot ${index + 1}](data:image/png;base64,${img})`
      ).join('\n\n');
    }

    return { 
      output: output.trim() || 'Code executed successfully (no output)',
      error: stderrOutput || undefined,
      plotImages: plotImages.length > 0 ? plotImages : undefined
    };
  } catch (error) {
    return {
      output: '',
      error: error instanceof Error ? error.message : 'Failed to execute Python code'
    };
  }
}

export const execPythonTool = {
  definition: {
    type: 'function' as const,
    function: {
      name: 'exec_python',
      description: 'Execute Python code using Pyodide. Supports multi-line code and common packages like numpy, pandas, and matplotlib.',
      parameters: {
        type: 'object' as const,
        properties: {
          code: {
            type: 'string',
            description: 'The Python code to execute. Can be multi-line.'
          }
        },
        required: ['code']
      }
    }
  },
  execute: async ({ code }: { code: string }) => {
    try {
      const result = await executePython(code);
      
      if (result.error) {
        return {
          success: false,
          error: result.error,
          output: result.output
        };
      }
      
      const response: any = {
        success: true,
        output: result.output
      };
      
      // Include plot images if they exist
      if (result.plotImages && result.plotImages.length > 0) {
        response.plotImages = result.plotImages;
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};
