/**
 * Main thread: the page and the applier, nothing else. Every element
 * call happens here; Lips itself runs on the background thread.
 */
import { connectMain } from '@lipsjs/lips/lynx/main'
/**
 * The component sheet, compiled to flat CSS by `pluginLips`. Imported
 * here, not with `@import` from style.css: css-loader requests an `@import`
 * past every configured loader, so it would reach Lynx uncompiled.
 */
import './app.lips.css'

const page = ( globalThis as any ).__CreatePage( '0', 0 )
connectMain( page )
