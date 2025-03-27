import type { FGUDBatchEntry, Metavars } from './types'
import type Component from './component'

/**
 * Update Queue System for high-frequency DOM updates
 */
export default class UpdateQueue<MT extends Metavars > {
  private pending = new Set<FGUDBatchEntry>()
  private isPending = false
  private component: Component<MT>
  
  // Metrics for tracking performance
  private metrics = {
    batchCount: 0,
    updatesProcessed: 0,
    lastBatchSize: 0,
    avgBatchSize: '0.00'
  }
  
  constructor( component: Component<MT> ){
    this.component = component
  }
  
  /**
   * Queue updates to be processed in the next tick
   */
  queue( entry: FGUDBatchEntry ){
    this.pending.add( entry )
    this.component.metrics.inc('dependencyUpdateCount')
    
    // Schedule processing if not already pending
    if( !this.isPending ){
      this.isPending = true
      this.scheduleProcessing()
    }
  }
  
  /**
   * Schedule processing using microtasks for better performance
   */
  private scheduleProcessing(){
    Promise.resolve().then( () => this.processQueue() )
  }
  
  /**
   * Process all queued updates in a batch
   */
  private processQueue(){
    // Get all dependency entries to process
    const entriesToProcess = Array.from( this.pending )
    
    // Update metrics
    this.metrics.batchCount++
    this.metrics.lastBatchSize = entriesToProcess.length
    this.metrics.updatesProcessed += entriesToProcess.length
    this.metrics.avgBatchSize = (this.metrics.updatesProcessed / this.metrics.batchCount).toFixed(2)
    
    // Clear the queue
    this.pending.clear()
    // Track batch stats
    this.component.metrics.trackBatch( entriesToProcess.length )
    
    // Apply all updates
    this.applyUpdates( entriesToProcess )
    // Reset pending flag
    this.isPending = false
    
    // Check if more updates were queued during processing
    if( this.pending.size > 0 ){
      this.isPending = true
      this.scheduleProcessing()
    }
  }
  
  /**
   * Apply updates to the DOM
   */
  private applyUpdates( entries: FGUDBatchEntry[] ){
    entries.forEach( ({ dep, dependent }) => {
      try {
        // Apply the update
        const sync = dependent.update( dependent.memo, 'batch-updator' )
        if( sync ){
          // Update memo if provided
          typeof sync.memo === 'object'
          && this.component.FGUD.get( dep )?.set( dependent.path, { ...dependent, memo: sync.memo } )
          
          // Run cleanup if provided
          typeof sync.cleanup === 'function' && sync.cleanup()
        }
      }
      catch( error ){
        console.error( 'Failed to update dependency --', error )
      }
    })
  }
  
  /**
   * Get current metrics
   */
  getMetrics(){
    return {
      batchCount: this.metrics.batchCount,
      lastBatchSize: this.metrics.lastBatchSize,
      avgBatchSize: this.metrics.avgBatchSize,
      totalUpdates: this.metrics.updatesProcessed
    }
  }
}