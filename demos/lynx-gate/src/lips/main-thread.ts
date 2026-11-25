import { connectMain } from '@lipsjs/lips/lynx/main'
import { logBytes, logFlushes } from '../screen'

declare const lynx: any

logFlushes('lips')
// What crosses: each op batch, as JSON
lynx.getJSContext().addEventListener( 'lips:ops', ( e: { data: unknown } ) => logBytes( 'lips', JSON.stringify( e.data ) ) )
connectMain( ( globalThis as any ).__CreatePage( '0', 0 ) )
