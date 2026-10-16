/**
 * Main thread: the page and the applier, nothing else. Every element
 * call happens here; Lips itself runs on the background thread.
 */
import { connectMain } from '../../../src/lynx/main'

// The Lynx SDK expects one; the binding needs no data processing
Object.assign( globalThis, { processData: ( data: unknown ) => data })

const page = ( globalThis as any ).__CreatePage( '0', 0 )
connectMain( page )
