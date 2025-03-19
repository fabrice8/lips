import type { Handler, Metavars } from '..'

/**
 * Performance Dashboard
 */
export interface Input {}

export interface State {
  metricsHistory: Array<{
    timestamp: number;
    metrics: any;
  }>;
  activeTab: string;
  isVisible: boolean;
}

export interface Static {
  refreshInterval: number;
  keyboardShortcut: string;
}

// Performance Dashboard Component Template
export const state = {
  metricsHistory: [],
  activeTab: 'rendering',
  isVisible: false
}
  
export const _static = {
  refreshInterval: 2000,
  keyboardShortcut: 'P'
}
  
export const handler: Handler<Metavars<Input, State, Static>> = {
  onCreate() {
    this.loadMetrics();
    
    // Add keyboard shortcut to toggle visibility
    document.addEventListener('keydown', (e) => {
      console.log( e.key, this.static.keyboardShortcut )
      if (e.ctrlKey && e.shiftKey && e.key === this.static.keyboardShortcut) {
        this.toggleVisibility();
      }
    });
  },
  
  onMount() {
    // Refresh metrics periodically
    this.refreshIntervalId = setInterval(() => {
      if (this.state.isVisible) {
        this.loadMetrics();
      }
    }, this.static.refreshInterval);
  },
  
  onDetach() {
    clearInterval(this.refreshIntervalId);
  },
  
  loadMetrics() {
    try {
      const metrics = JSON.parse(localStorage.getItem('lipsPerformanceMetrics') || '[]');
      this.state.metricsHistory = metrics
    } catch (e) {
      console.error('Failed to load performance metrics', e);
    }
  },
  
  toggleVisibility() {
    this.state.isVisible = !this.state.isVisible
  },
  
  setActiveTab(tab: string) {
    this.state.activeTab = tab
  },
  
  clearMetrics() {
    localStorage.removeItem('lipsPerformanceMetrics')
    this.state.metricsHistory = []
  },
  
  getLatestMetrics() {
    if (!this.state.metricsHistory.length) return null;
    return this.state.metricsHistory[this.state.metricsHistory.length - 1].metrics;
  }
}
  
export default `
  <div class="perf-dashboard" style="{ display: state.isVisible ? 'block' : 'none' }">
    <div class="perf-dashboard-header">
      <h3 class="perf-dashboard-title">Lips Performance Dashboard</h3>
      <div class="perf-dashboard-controls">
        <button class="clear" on-click(clearMetrics)>Clear</button>
        <button on-click(toggleVisibility)>Close</button>
      </div>
    </div>
    
    <div class="perf-dashboard-tabs">
      <button class="perf-dashboard-tab {state.activeTab === 'rendering' ? 'active' : ''}" 
              on-click(setActiveTab, 'rendering')>Rendering</button>
      <button class="perf-dashboard-tab {state.activeTab === 'components' ? 'active' : ''}" 
              on-click(setActiveTab, 'components')>Components</button>
      <button class="perf-dashboard-tab {state.activeTab === 'dom' ? 'active' : ''}" 
              on-click(setActiveTab, 'dom')>DOM</button>
      <button class="perf-dashboard-tab {state.activeTab === 'memory' ? 'active' : ''}" 
              on-click(setActiveTab, 'memory')>Memory</button>
    </div>
    
    <!-- Rendering Tab -->
    <div style="{ display: state.activeTab === 'rendering' ? 'block' : 'none' }">
      <div class="perf-dashboard-chart">
        <for [point, i] in=state.metricsHistory.slice(-30)>
          <div class="perf-dashboard-chart-bar render-avg" 
                style="{ height: (point.metrics.avgRenderTime * 2)+'px', left: (i * (100/30))+'%' }"></div>
          <div class="perf-dashboard-chart-bar render-max" 
                style="{ height: (point.metrics.maxRenderTime * 2)+'px', left: (i * (100/30))+'%' }"></div>
        </for>
        <div class="perf-dashboard-legend">Render Time (ms): Avg (green), Max (orange)</div>
      </div>
      
      <table class="perf-dashboard-metrics">
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>

        <if( state.metricsHistory.length > 0 )>
          <let latest=self.getLatestMetrics()/>

          <tr>
            <td>Avg Render Time</td>
            <td>{self.getLatestMetrics()?.avgRenderTime.toFixed(2)} ms</td>
          </tr>
          <tr>
            <td>Max Render Time</td>
            <td>{self.getLatestMetrics()?.maxRenderTime.toFixed(2)} ms</td>
          </tr>
          <tr>
            <td>Render Count</td>
            <td>{self.getLatestMetrics()?.renderCount}</td>
          </tr>
          <tr>
            <td>Element Count</td>
            <td>{self.getLatestMetrics()?.elementCount}</td>
          </tr>
        </if>
      </table>
    </div>
    
    <!-- Components Tab -->
    <div style="{ display: state.activeTab === 'components' ? 'block' : 'none' }">
      <div class="perf-dashboard-chart">
        <for [point, i] in=state.metricsHistory.slice(-30)>
          <div class="perf-dashboard-chart-bar component-updates" 
                style="{ height: (point.metrics.componentUpdateCount)+'px', left: (i * (100/30))+'%' }"></div>
        </for>
        <div class="perf-dashboard-legend">Component Updates</div>
      </div>
      
      <table class="perf-dashboard-metrics">
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>

        <if( state.metricsHistory.length > 0 )>
          <let latest=self.getLatestMetrics()/>
          <tr>
            <td>Component Count</td>
            <td>{latest?.componentCount}</td>
          </tr>
          <tr>
            <td>Component Updates</td>
            <td>{latest?.componentUpdateCount}</td>
          </tr>
          <tr>
            <td>Dependency Tracks</td>
            <td>{latest?.dependencyTrackCount}</td>
          </tr>
          <tr>
            <td>Dependency Updates</td>
            <td>{latest?.dependencyUpdateCount}</td>
          </tr>
        </if>
      </table>
    </div>
    
    <!-- DOM Tab -->
    <div style="{ display: state.activeTab === 'dom' ? 'block' : 'none' }">
      <div class="perf-dashboard-chart">
        <for [point, i] in=state.metricsHistory.slice(-30)>
          <div class="perf-dashboard-chart-bar dom-ops" 
                style="{ height: (point.metrics.domOperations / 5)+'px', left: (i * (100/30))+'%' }"></div>
        </for>
        <div class="perf-dashboard-legend">DOM Operations</div>
      </div>
      
      <table class="perf-dashboard-metrics">
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>

        <if( state.metricsHistory.length > 0 )>
          <let latest="self.getLatestMetrics()"/>
          <tr>
            <td>DOM Operations</td>
            <td>{latest?.domOperations}</td>
          </tr>
          <tr>
            <td>DOM Inserts</td>
            <td>{latest?.domInsertsCount}</td>
          </tr>
          <tr>
            <td>DOM Updates</td>
            <td>{latest?.domUpdatesCount}</td>
          </tr>
          <tr>
            <td>DOM Removals</td>
            <td>{latest?.domRemovalsCount}</td>
          </tr>
        </if>
      </table>
    </div>
    
    <!-- Memory Tab -->
    <div style="{ display: state.activeTab === 'memory' ? 'block' : 'none' }">
      <div class="perf-dashboard-chart">
        <for [point, i] in=state.metricsHistory.slice(-30)>
          <div class="perf-dashboard-chart-bar memory" 
                style="{ height: (point.metrics.memoryUsage ? point.metrics.memoryUsage * 2 : 0)+'px', left: (i * (100/30))+'%' }"></div>
        </for>
        <div class="perf-dashboard-legend">Memory Usage (MB)</div>
      </div>
      
      <table class="perf-dashboard-metrics">
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>

        <if( state.metricsHistory.length > 0 )>
          <let latest="self.getLatestMetrics()"/>
          <tr>
            <td>Memory Usage</td>
            <td>{latest?.memoryUsage ? latest.memoryUsage.toFixed(2) + ' MB' : 'N/A'}</td>
          </tr>
          <tr>
            <td>Batch Count</td>
            <td>{latest?.batchCount}</td>
          </tr>
          <tr>
            <td>Average Batch Size</td>
            <td>{latest?.batchCount > 0 ? (latest.batchSize / latest.batchCount).toFixed(2) : '0'}</td>
          </tr>
          <tr>
            <td>Error Count</td>
            <td>{latest?.errorCount}</td>
          </tr>
        </if>
      </table>
    </div>
    
    <div class="perf-dashboard-footer">
      Press Ctrl+Shift+{static.keyboardShortcut} to toggle dashboard
    </div>
  </div>
`

export const stylesheet = `
  .perf-dashboard {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 400px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 10px;
    border-top-left-radius: 8px;
    z-index: 9999;
    font-family: monospace;
    overflow: auto;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
  }
  
  .perf-dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    border-bottom: 1px solid #444;
    padding-bottom: 5px;
  }
  
  .perf-dashboard-title {
    margin: 0; 
    font-size: 14px;
    font-weight: bold;
  }
  
  .perf-dashboard-controls button {
    background: #555;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 10px;
    cursor: pointer;
    margin-left: 5px;
  }
  
  .perf-dashboard-controls button.clear {
    background: #f44336;
  }
  
  .perf-dashboard-tabs {
    display: flex;
    margin-bottom: 10px;
  }
  
  .perf-dashboard-tab {
    flex: 1;
    border: none;
    padding: 5px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 0;
    background: #555;
    color: white;
  }
  
  .perf-dashboard-tab.active {
    background: #4CAF50;
  }
  
  .perf-dashboard-tab:first-child {
    border-radius: 3px 0 0 3px;
  }
  
  .perf-dashboard-tab:last-child {
    border-radius: 0 3px 3px 0;
  }
  
  .perf-dashboard-chart {
    height: 150px;
    background: #222;
    margin-bottom: 10px;
    position: relative;
    border: 1px solid #444;
  }
  
  .perf-dashboard-chart-bar {
    position: absolute;
    width: 2px;
    bottom: 0;
    transform: translateX(-50%);
  }
  
  .perf-dashboard-chart-bar.render-avg {
    background: #4CAF50;
  }
  
  .perf-dashboard-chart-bar.render-max {
    background: #FF5722;
  }
  
  .perf-dashboard-chart-bar.component-updates {
    background: #2196F3;
  }
  
  .perf-dashboard-chart-bar.dom-ops {
    background: #9C27B0;
  }
  
  .perf-dashboard-chart-bar.memory {
    background: #FFC107;
  }
  
  .perf-dashboard-legend {
    position: absolute;
    bottom: 5px;
    left: 5px;
    font-size: 10px;
    color: #aaa;
  }
  
  .perf-dashboard-metrics {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  
  .perf-dashboard-metrics th {
    text-align: left;
    padding: 4px;
    border-bottom: 1px solid #444;
  }
  
  .perf-dashboard-metrics td {
    padding: 3px;
    border-bottom: 1px solid #333;
  }
  
  .perf-dashboard-metrics td:last-child {
    text-align: right;
  }
  
  .perf-dashboard-footer {
    font-size: 10px;
    margin-top: 10px;
    text-align: center;
    color: #888;
  }
`