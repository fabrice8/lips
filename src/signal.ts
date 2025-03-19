/**
 * A particular Subscriber has many Dependencies 
 * it depends on
 */
type Subscriber = {
  execute(): void
  dependencies: Set<Dependency>
  isDisposed: boolean
}

/**
 * A Dependency has many different Subscribers 
 * depending on it
 */ 
type Dependency = Set<Subscriber>
type Listener = () => unknown
type HistoryEntry<T> = {
  value: T
  timestamp: number
  metadata?: Record<string, unknown>
}

type Signal<T> = [
  read: () => T,
  write: ( nextValue: T, metadata?: Record<string, unknown> ) => void,
  history: {
    undo: () => void
    redo: () => void
    jumpTo: (index: number) => void
    getHistory: () => HistoryEntry<T>[]
    getCurrentIndex: () => number
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
  }
]

interface Batch {
  add( sub: Subscriber ): void
  flush(): void
}
export interface EffectControl {
  dispose(): void
}

const context: Subscriber[] = []
let currentBatch: Batch | null = null

function subscribe( running: Subscriber, subscriptions: Dependency ){
  if( running.isDisposed ) return

  subscriptions.add( running )
  running.dependencies.add( subscriptions )
}

function cleanup( running: Subscriber ){
  for( const dep of running.dependencies )
    dep.delete( running )
  
  running.dependencies.clear()
}

function createBatch(): Batch {
  const updates = new Set<Subscriber>()
  return {
    add( sub: Subscriber ){
      !sub.isDisposed && updates.add( sub )
    },
    flush() {
      for( const sub of updates )
        !sub.isDisposed && sub.execute()
      
      updates.clear()
    }
  }
}

export function batch<T>( fn: () => T ): T {
  const prevBatch = currentBatch
  currentBatch = createBatch()
  
  try {
    const result = fn()
    currentBatch.flush()

    return result
  }
  finally {
    currentBatch = prevBatch
  }
}

export function signal<T>( value: T, options = { maxSize: 100 }): Signal<T> {
  const 
  subscriptions: Dependency = new Set(),
  history: HistoryEntry<T>[] = [{ value, timestamp: Date.now() }]

  let currentIndex = 0

  const read = () => {
    const running = context[ context.length - 1 ]
    running && subscribe( running, subscriptions )

    return history[ currentIndex ].value
  }

  const notifySubscribers = () => {
    const subs = [ ...subscriptions ]
    if( currentBatch )
      for( const sub of subs ) 
        currentBatch.add( sub )

    else for( const sub of subs ) sub.execute()
  }

  const write = ( nextValue: T, metadata?: Record<string, unknown> ) => {
    // Skip if value hasn't changed
    if( Object.is( history[ currentIndex ].value, nextValue ) )
      return

    // Remove future history if we're not at the latest state
    if( currentIndex < history.length - 1 )
      history.splice( currentIndex + 1 )

    // Add new entry
    history.push({
      value: nextValue,
      timestamp: Date.now(),
      metadata
    })

    // Maintain history size limit
    if( history.length > options.maxSize ){
      history.shift()
      currentIndex = Math.max( 0, currentIndex - 1 )
    }
    else currentIndex++

    notifySubscribers()
  }

  const controls = {
    undo(){
      if( currentIndex > 0 ){
        currentIndex--
        notifySubscribers()
      }
    },
    redo(){
      if( currentIndex < history.length - 1 ){
        currentIndex++
        notifySubscribers()
      }
    },
    jumpTo( index: number ){
      if( index >= 0 && index < history.length && index !== currentIndex ){
        currentIndex = index
        notifySubscribers()
      }
    },
    getHistory(){
      return [ ...history ]
    },
    getCurrentIndex(){
      return currentIndex
    },
    canUndo(){
      return currentIndex > 0
    },
    canRedo(){
      return currentIndex < history.length - 1
    },
    clear(){
      // Reset to initial state
      const initialState = history[0]

      history.length = 0
      history.push( initialState )

      currentIndex = 0

      notifySubscribers()
    }
  }

  return [ read, write, controls ]
}

export function effect( fn: Listener ): EffectControl {
  let isRunning = false
  
  const execute = () => {
    if( isRunning ) 
      throw new Error( 'Circular dependency detected' )
    
    if( running.isDisposed ) return
    
    isRunning = true
    cleanup( running )
    context.push( running )

    try { fn() }
    finally { 
      isRunning = false
      context.pop() 
    }
  }

  const running: Subscriber = {
    execute,
    dependencies: new Set(),
    isDisposed: false
  }

  execute()

  return {
    dispose: () => {
      running.isDisposed = true
      cleanup( running )
    }
  }
}

export function memo( fn: Listener ){
  const [ s, set ] = signal<any>('')
  const { dispose } = effect( () => set( fn() ) )
  
  return [ s, dispose ]
}

// /**
//  * Testing ...
//  */
// // Disposable effects
// function textEffects(){
//   const [value, setValue] = signal(0)

//   const { dispose } = effect(() => {
//     console.log(value())
//   })

//   setValue(1)  // Logs: 1
//   dispose()    // Clean up the effect
  
//   setValue(2)  // Nothing logged cause effect cleaned up
// }

// // Batched updates
// function textBatch(){
//   const [ count, setCount ] = signal(0)

//   batch(() => {
//     setCount(1)  // Won't trigger effects yet
//     setCount(2)  // Won't trigger effects yet
//   })
  
//   // Effects trigger once here
//   const { dispose } = effect(() => {
//     console.log( count() )
//   })

//   dispose() // Clean up the effect
//   setCount(3)
// }

// // Memo with disposal
// function testMemo(){
//   const 
//   [ count, setCount ] = signal(0),
//   [ doubled, dispose ] = memo( () => count() * 2 )
  
//   console.log( doubled() )
//   setCount(1)
//   console.log( doubled() )

//   dispose() // Clean up the memo
// }

// // textEffects()
// // textBatch()
// testMemo()