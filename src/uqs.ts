import type { FGUDBatchEntry, Metavars } from './types'
import type Component from './component'

/**
 * Update Queue System for high-frequency DOM updates
 */
export default class UpdateQueue<MT extends Metavars > {
  private pending: Set<FGUDBatchEntry>[] = []
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
    /**
     * Add priority slot if not
     * 
     * Default => 2
     */
    const priority = entry.dependent.priority ?? 2
    if( !this.pending[ priority ] )
      this.pending[ priority ] = new Set()

    /**
     * TODO: Review the override of pending update
     * of same dependent.
     * 
     * If not functioning as expected. Revert
     * `this.pending` to a `Set` instead of `Map`.
     */
    this.pending[ priority ].add( entry )
    this.component.metrics.inc('dependencyUpdateCount')
    
    // Schedule processing if not already pending
    if( !this.isPending ){
      this.isPending = true
      this.scheduleProcessing()
    }
  }
  apply({ dep, dependent }: FGUDBatchEntry, by = 'batch-updator' ){
    try {
      // Apply the update
      const sync = dependent.update( dependent.memo, by )
      if( sync ){
        /**
         * Post-update memo for co-dependency update 
         * processors like partial updates.
         */
        typeof sync.memo === 'object'
        && this.component.FGUD.get( dep )?.set( dependent.path, { ...dependent, memo: sync.memo } )
        
        /**
         * Manual cleanup callback function after
         * dependency track adopted new changes.
         * 
         * Useful for DOM cleanup for instance of 
         * complex wired $fragment.
         */
        typeof sync.cleanup === 'function' && sync.cleanup()
      }
    }
    catch( error ){
      console.error( 'Failed to update dependency --', error )
    }
  }
  
  /**
   * Schedule processing using microtasks for better performance
   */
  private scheduleProcessing(){
    Promise
    .resolve()
    .then( () => this.processQueue() )
  }
  
  /**
   * Process all queued updates in a batch
   */
  private processQueue(){
    const exec = ( badge: Set<FGUDBatchEntry> ) => {
      const entries = Array.from( badge )

      // Update metrics
      this.metrics.batchCount++
      this.metrics.lastBatchSize = entries.length
      this.metrics.updatesProcessed += entries.length
      this.metrics.avgBatchSize = (this.metrics.updatesProcessed / this.metrics.batchCount).toFixed(2)
      
      // Clear the queue
      badge.clear()
      // Track batch stats
      this.component.metrics.trackBatch( entries.length )
      // Apply all updates
      entries.forEach( entry => this.apply( entry ) )
    }

    /**
     * Execute dependency entries by priority 0 to x
     */
    this.pending.forEach( badge => badge && badge.size && exec( badge ) )

    // Reset pending flag
    this.isPending = false
    
    // Check if more updates were queued during processing
    if( this.pending.find( each => each && each.size > 0 ) ){
      this.isPending = true
      this.scheduleProcessing()
    }
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