import Lips from '../src/lips';
import type { Handler, Metavars } from '../src';

// Types for our stress test
interface StressTestState {
  counter: number;
  counterHistory: number[];
  updateFrequency: number; // ms between updates
  isRunning: boolean;
  metrics: {
    fps: number;
    avgRenderTime: number;
    totalUpdates: number;
    memoryUsageMB: number;
    domOperations: number;
  };
}
interface StressTestStatic {
  // Interval handle for the stress test
  updateInterval: any
  frameCountInterval: any,
  
  // Performance tracking
  frameCount: number
  lastFrameTimestamp: number
  updateTimes: number[]
}

/**
 * Creates a stress test application for the Lips framework
 * This will run high-frequency state updates to test the reactive system
 */
export function createLipsStressTest(targetElement: string = 'body') {
  const state: StressTestState = {
    counter: 0,
    counterHistory: [],
    updateFrequency: 16, // Default to ~60fps
    isRunning: false,
    metrics: {
      fps: 0,
      avgRenderTime: 0,
      totalUpdates: 0,
      memoryUsageMB: 0,
      domOperations: 0
    }
  };

  const _static: StressTestStatic = {
    // Interval handle for the stress test
    updateInterval: null as any,
    frameCountInterval: null as any,
    
    // Performance tracking
    frameCount: 0,
    lastFrameTimestamp: 0,
    updateTimes: [] as number[]
  }

  const handler: Handler<Metavars<any, StressTestState, StressTestStatic>> = {
    
    onCreate() {
      console.log('Stress test component created');
    },
    
    onMount() {
      console.log('Stress test component mounted');
      // Start tracking performance metrics
      this.startPerformanceTracking();
    },
    
    onRender() {
      // Track when render happens
      const now = performance.now();
      if (this.static.lastFrameTimestamp) {
        const frameTime = now - this.static.lastFrameTimestamp;
        if (frameTime < 1000) { // Ignore outliers > 1s
          this.static.updateTimes.push(frameTime);
          
          // Keep only the last 100 timings
          if (this.static.updateTimes.length > 100) {
            this.static.updateTimes.shift();
          }
        }
      }
      this.static.lastFrameTimestamp = now;
      this.static.frameCount++;
    },
    
    startPerformanceTracking() {
      // Calculate FPS every second
      this.static.frameCountInterval = setInterval(() => {
        // Calculate FPS
        this.state.metrics.fps = this.static.frameCount;
        this.static.frameCount = 0;
        
        // Calculate average render time
        if (this.static.updateTimes.length) {
          const avgTime = this.static.updateTimes.reduce((a, b) => a + b, 0) / this.static.updateTimes.length;
          this.state.metrics.avgRenderTime = avgTime;
        }
        
        // Get memory usage if available
        if (window.performance && (window.performance as any).memory) {
          this.state.metrics.memoryUsageMB = (window.performance as any).memory.usedJSHeapSize / (1024 * 1024);
        }
      }, 1000);
    },
    
    startStressTest() {
      if (this.state.isRunning) return;
      
      this.state.isRunning = true;
      this.state.counterHistory = [];
      
      this.static.updateInterval = setInterval(() => {
        this.state.counter++;
        this.state.metrics.totalUpdates++;
        
        // Keep history for visualization 
        if (this.state.counterHistory.length > 100) {
          this.state.counterHistory.shift();
        }
        this.state.counterHistory.push(this.state.counter);
      }, this.state.updateFrequency);
    },
    
    stopStressTest() {
      if (!this.state.isRunning) return;
      
      clearInterval(this.static.updateInterval);
      this.state.isRunning = false;
    },
    
    setUpdateFrequency(event: any) {
      const frequency = parseFloat(event.target.value);
      this.state.updateFrequency = frequency;
      
      // Restart if running
      if (this.state.isRunning) {
        this.stopStressTest();
        this.startStressTest();
      }
    },
    
    resetCounter() {
      this.state.counter = 0;
      this.state.counterHistory = [];
      this.state.metrics.totalUpdates = 0;
    },
    
    runHeavyComputation() {
      // Simulate a CPU-intensive task
      const start = performance.now();
      
      // Loop that will take ~500ms on a typical machine
      let sum = 0;
      for (let i = 0; i < 10000000; i++) {
        sum += Math.sqrt(i);
      }
      
      console.log(`Heavy computation completed in ${performance.now() - start}ms, result: ${sum}`);
    },
    
    destroy() {
      // Clean up
      clearInterval(this.static.updateInterval);
      clearInterval(this.static.frameCountInterval);
    }
  };

  // Main template for the stress test
  const template = `
    <div class="stress-test-container">
      <h2>Lips Framework Stress Test</h2>
      
      <div class="controls">
        <div class="form-group">
          <label for="update-frequency">Update Frequency (ms):</label>
          <input 
            type="range" 
            id="update-frequency" 
            min="1" 
            max="100" 
            value="{state.updateFrequency}" 
            on-input(setUpdateFrequency)
          />
          <span>{state.updateFrequency}ms</span>
        </div>
        
        <div class="actions">
          <if( !state.isRunning )>
            <button class="start-btn" on-click(startStressTest)>Start Stress Test</button>
          </if>
          <else>
            <button class="stop-btn" on-click(stopStressTest)>Stop Stress Test</button>
          </else>
          
          <button class="reset-btn" on-click(resetCounter)>Reset Counter</button>
          <button class="heavy-btn" on-click(runHeavyComputation)>Run Heavy Computation</button>
        </div>
      </div>
      
      <div class="counter-display">
        <h3>Counter Value: <span class="counter-value">{state.counter}</span></h3>
        
        <div class="counter-visualization">
          <for [value, index] in=state.counterHistory>
            <div 
              class="history-bar" 
              style="height: {Math.min(value % 100, 100)}px; background-color: hsl({value % 360}, 80%, 60%);"
              title="Update #{index}: {value}"
            ></div>
          </for>
        </div>
      </div>
      
      <div class="metrics-panel">
        <h3>Performance Metrics</h3>
        <table class="metrics-table">
          <tr>
            <td>FPS:</td>
            <td class="metric-value">{state.metrics.fps}</td>
          </tr>
          <tr>
            <td>Avg Render Time:</td>
            <td class="metric-value">{state.metrics.avgRenderTime.toFixed(2)} ms</td>
          </tr>
          <tr>
            <td>Total Updates:</td>
            <td class="metric-value">{state.metrics.totalUpdates}</td>
          </tr>
          <tr>
            <td>Memory Usage:</td>
            <td class="metric-value">{state.metrics.memoryUsageMB.toFixed(2)} MB</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  // CSS for the stress test
  const stylesheet = `
    .stress-test-container {
      font-family: 'Arial', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f7f7;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    h2, h3 {
      color: #333;
      margin-bottom: 20px;
    }
    
    .controls {
      display: flex;
      flex-direction: column;
      gap: 15px;
      margin-bottom: 20px;
      padding: 15px;
      background-color: #fff;
      border-radius: 6px;
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.05);
    }
    
    .form-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    label {
      min-width: 180px;
      font-weight: bold;
    }
    
    input[type="range"] {
      flex: 1;
    }
    
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    
    .start-btn {
      background-color: #4caf50;
      color: white;
    }
    
    .stop-btn {
      background-color: #f44336;
      color: white;
    }
    
    .reset-btn {
      background-color: #2196f3;
      color: white;
    }
    
    .heavy-btn {
      background-color: #ff9800;
      color: white;
    }
    
    button:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }
    
    .counter-display {
      margin-top: 30px;
      text-align: center;
    }
    
    .counter-value {
      font-size: 1.5em;
      font-weight: bold;
      color: #1976d2;
    }
    
    .counter-visualization {
      height: 100px;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      overflow-x: auto;
      padding: 10px;
      background-color: #fff;
      border-radius: 6px;
      margin-top: 20px;
    }
    
    .history-bar {
      width: 8px;
      min-width: 8px;
      background-color: #2196f3;
      transition: height 0.2s ease;
    }
    
    .metrics-panel {
      margin-top: 30px;
      padding: 15px;
      background-color: #fff;
      border-radius: 6px;
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.05);
    }
    
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .metrics-table td {
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    
    .metrics-table td:first-child {
      font-weight: bold;
      width: 50%;
    }
    
    .metric-value {
      font-family: monospace;
      font-size: 1.1em;
      color: #1976d2;
    }
  `;

  // Create a Lips instance
  const lips = new Lips({ debug: true });
  
  // Render the stress test app
  const stressTestApp = lips.render(
    'StressTestApp', 
    { 
      default: template, 
      state,
      _static,
      handler,
      stylesheet
    }, 
    {} // Empty input
  );
  
  // Append to target element
  stressTestApp.appendTo(targetElement);
  
  // Return the app instance for external control
  return stressTestApp;
}

/**
 * High-frequency update test to measure how well Lips handles rapid state changes
 */
export function runHighFrequencyTest(targetElement: string = 'body', duration: number = 5000) {
  console.log(`Running high frequency update test for ${duration}ms...`);
  
  const state = {
    counter: 0,
    elapsedTime: 0,
    updatesPerSecond: 0,
    totalUpdates: 0,
    isRunning: false,
    testComplete: false,
    testResults: {
      totalUpdates: 0,
      duration: 0,
      updatesPerSecond: 0,
      avgUpdateTime: 0
    }
  };
  const _static = {
    updateIntervalId: null as any,
    startTime: 0,
    updateTimes: [] as number[],
  }
  const handler: Handler<Metavars<any, typeof state, typeof _static>> = {
    startTest() {
      if (this.state.isRunning) return;
      
      this.state.isRunning = true;
      this.state.testComplete = false;
      this.state.counter = 0;
      this.state.totalUpdates = 0;
      this.state.elapsedTime = 0;
      this.static.startTime = performance.now();
      this.static.updateTimes = [];
      
      // Create a loop that updates state as fast as possible
      const runUpdate = () => {
        if (!this.state.isRunning) return;
        
        const beforeUpdate = performance.now();
        
        // Update state
        this.state.counter++;
        this.state.totalUpdates++;
        this.state.elapsedTime = beforeUpdate - this.static.startTime;
        
        // Calculate updates per second
        if (this.state.elapsedTime > 0) {
          this.state.updatesPerSecond = Math.round((this.state.totalUpdates / this.state.elapsedTime) * 1000);
        }
        
        // Record update time
        const afterUpdate = performance.now();
        this.static.updateTimes.push(afterUpdate - beforeUpdate);
        
        // Check if test duration is reached
        if (this.state.elapsedTime >= duration) {
          this.finishTest();
          return;
        }
        
        // Schedule next update
        requestAnimationFrame(runUpdate); // 60Hz
        // setTimeout(() => runUpdate(), 0 ); // 0ms
      };
      
      // Start the update loop
      requestAnimationFrame(runUpdate); // 60Hz
      // setTimeout(() => runUpdate(), 0 ); // 0ms
    },
    
    finishTest() {
      this.state.isRunning = false;
      this.state.testComplete = true;
      
      // Calculate test results
      const avgUpdateTime = this.static.updateTimes.reduce((a, b) => a + b, 0) / this.static.updateTimes.length;
      
      this.state.testResults = {
        totalUpdates: this.state.totalUpdates,
        duration: this.state.elapsedTime,
        updatesPerSecond: this.state.updatesPerSecond,
        avgUpdateTime: avgUpdateTime
      };
      
      console.log('High Frequency Test Results:', this.state.testResults);
    }
  };
  
  // Template for the high frequency test
  const template = `
    <div class="high-freq-test">
      <h2>High Frequency Update Test</h2>
      <p>This test measures how many state updates Lips can handle per second.</p>
      
      <div class="test-controls">
        <if( !state.isRunning && !state.testComplete )>
          <button on-click(startTest)>Start Test (${duration/1000}s)</button>
        </if>
        <else-if( state.isRunning )>
          <div class="progress">
            <div class="progress-bar" style="width: {(state.elapsedTime / ${duration}) * 100}%"></div>
          </div>
          <div class="stats">
            <div>Counter: {state.counter}</div>
            <div>Elapsed: {(state.elapsedTime / 1000).toFixed(1)}s</div>
            <div>Updates/sec: {state.updatesPerSecond}</div>
          </div>
        </else-if>
        <else>
          <div class="results">
            <h3>Test Complete!</h3>
            <table>
              <tr>
                <td>Total Updates:</td>
                <td>{state.testResults.totalUpdates}</td>
              </tr>
              <tr>
                <td>Duration:</td>
                <td>{(state.testResults.duration / 1000).toFixed(2)}s</td>
              </tr>
              <tr>
                <td>Updates Per Second:</td>
                <td>{state.testResults.updatesPerSecond}</td>
              </tr>
              <tr>
                <td>Avg Update Time:</td>
                <td>{state.testResults.avgUpdateTime.toFixed(3)}ms</td>
              </tr>
            </table>
            <button on-click(startTest)>Run Again</button>
          </div>
        </else>
      </div>
    </div>
  `;
  
  // CSS for the high frequency test
  const stylesheet = `
    .high-freq-test {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      font-family: 'Arial', sans-serif;
    }
    
    .test-controls {
      margin-top: 20px;
    }
    
    button {
      padding: 10px 20px;
      background-color: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    
    .progress {
      height: 20px;
      background-color: #e0e0e0;
      border-radius: 10px;
      margin: 20px 0;
      overflow: hidden;
    }
    
    .progress-bar {
      height: 100%;
      background-color: #4285f4;
      transition: width 0.2s;
    }
    
    .stats {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    
    .results {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    table {
      width: 100%;
      margin: 20px 0;
      border-collapse: collapse;
    }
    
    td {
      padding: 8px;
      border-bottom: 1px solid #eee;
    }
    
    td:first-child {
      font-weight: bold;
    }
  `;
  
  // Create and render the app
  const lips = new Lips({ debug: true });
  const app = lips.render('HighFrequencyTest', { default: template, state, handler, stylesheet }, {});
  app.appendTo(targetElement);
  
  return app;
}

/**
 * DOM stress test to measure how well Lips handles large DOM updates
 */
export function runDOMStressTest(targetElement: string = 'body') {
  const state = {
    nodeCount: 1000,
    renderTime: 0,
    isRendering: false,
    nodes: [] as { id: number, value: string }[]
  };
  
  const handler: Handler<Metavars<any, typeof state>> = {
    createNodes(count: number) {
      this.state.isRendering = true;
      
      // Generate nodes
      const startTime = performance.now();
      
      const nodes = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          id: i,
          value: `Node ${i}: ${Math.random().toString(36).substring(2, 15)}`
        });
      }
      
      this.state.nodes = nodes;
      
      // Measure render time (will be updated after render completes)
      this.state.renderTime = performance.now() - startTime;
      
      setTimeout(() => {
        // Update with actual render time
        this.state.renderTime = performance.now() - startTime;
        this.state.isRendering = false;
      }, 10);
    },
    
    shuffleNodes() {
      this.state.isRendering = true;
      const startTime = performance.now();
      
      // Create a copy and shuffle
      const shuffled = [...this.state.nodes];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      this.state.nodes = shuffled;
      
      setTimeout(() => {
        this.state.renderTime = performance.now() - startTime;
        this.state.isRendering = false;
      }, 10);
    },
    
    updateValues() {
      this.state.isRendering = true;
      const startTime = performance.now();
      
      // Update all values
      const updated = this.state.nodes.map(node => ({
        ...node,
        value: `Node ${node.id}: ${Math.random().toString(36).substring(2, 15)}`
      }));
      
      this.state.nodes = updated;
      
      setTimeout(() => {
        this.state.renderTime = performance.now() - startTime;
        this.state.isRendering = false;
      }, 10);
    },
    
    setNodeCount(e: any) {
      this.state.nodeCount = parseInt(e.target.value, 10);
    }
  };
  
  // Template for the DOM stress test
  const template = `
    <div class="dom-stress-test">
      <h2>DOM Stress Test</h2>
      
      <div class="controls">
        <div class="input-group">
          <label for="node-count">Number of Nodes:</label>
          <input 
            type="number"
            id="node-count"
            min="100"
            max="10000"
            step="100"
            value=state.nodeCount
            on-input(setNodeCount)/>
        </div>
        
        <div class="buttons">
          <button on-click(createNodes, state.nodeCount) disabled=state.isRendering>
            Render Nodes
          </button>
          <button on-click(shuffleNodes) disabled="state.isRendering || !state.nodes.length">
            Shuffle Nodes
          </button>
          <button on-click(updateValues) disabled="state.isRendering || !state.nodes.length">
            Update Values
          </button>
        </div>
        
        <div class="render-info">
          <if( state.isRendering )>
            <div class="loading">Rendering...</div>
          </if>
          <else-if( state.renderTime > 0 )>
            <div class="render-time">Render Time: {state.renderTime.toFixed(2)}ms</div>
          </else-if>
        </div>
      </div>
      
      <div class="nodes-container">
        <if( state.nodes.length )>
          <for [node] in=state.nodes>
            <div class="node" key=node.id>{node.value}</div>
          </for>
        </if>
      </div>
    </div>
  `;
  
  // CSS for the DOM stress test
  const stylesheet = `
    .dom-stress-test {
      max-width: 800px;
      margin: 20px auto;
      padding: 20px;
      font-family: 'Arial', sans-serif;
    }
    
    .controls {
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 8px;
    }
    
    .input-group {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
    }
    
    label {
      margin-right: 10px;
      min-width: 150px;
    }
    
    input {
      padding: 8px;
      width: 150px;
    }
    
    .buttons {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    button {
      padding: 8px 15px;
      background-color: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    button:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }
    
    .render-info {
      font-weight: bold;
      height: 24px;
    }
    
    .loading {
      color: #ff9800;
    }
    
    .render-time {
      color: #4285f4;
    }
    
    .nodes-container {
      border: 1px solid #e0e0e0;
      padding: 10px;
      border-radius: 4px;
      max-height: 400px;
      overflow-y: auto;
      background-color: #fafafa;
    }
    
    .node {
      padding: 8px;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }
    
    .node:last-child {
      border-bottom: none;
    }
  `;
  
  // Create and render the app
  const lips = new Lips({ debug: true });
  const app = lips.render('DOMStressTest', { default: template, state, handler, stylesheet }, {});
  app.appendTo(targetElement);
  
  return app;
}

/**
 * Run all stress tests for the Lips framework
 */
export function runAllStressTests(targetElement: string = 'body') {
  // Create a container for all stress tests
  const container = document.createElement('div');
  container.className = 'stress-tests-suite';
  container.innerHTML = `
    <h1>Lips Framework Stress Test Suite</h1>
    
    <div class="test-section" id="stress-test"></div>
    <div class="test-section" id="high-frequency-test"></div>
    <div class="test-section" id="dom-stress-test"></div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .stress-tests-suite {
      font-family: 'Arial', sans-serif;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      text-align: center;
      margin-bottom: 30px;
      color: #333;
    }
    
    .test-section {
      margin-bottom: 40px;
      border: 1px solid #e0e0e0;
      padding: 10px;
      border-radius: 8px;
    }
  `;
  
  document.head.appendChild(style);
  document.querySelector(targetElement)?.appendChild(container);
  
  // Run individual tests
  createLipsStressTest('#stress-test');
  runHighFrequencyTest('#high-frequency-test', 3000);
  runDOMStressTest('#dom-stress-test');
  
  return {
    container
  };
}


// createLipsStressTest();
// runHighFrequencyTest();
runDOMStressTest();
// runAllStressTests()