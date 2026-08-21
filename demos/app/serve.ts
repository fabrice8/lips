/**
 * Dev server for the demo.
 *
 * `<router global>` drives real URLs through `history.pushState`, so every
 * unknown path has to fall back to index.html — otherwise a deep link like
 * /reactivity is a 404 from the file server and the app never boots.
 *
 *   bun run serve            # http://localhost:3210
 *   PORT=4000 bun run serve
 */
const ROOT = new URL('.', import.meta.url ).pathname
const PORT = Number( process.env.PORT || 3210 )

const server = Bun.serve({
  port: PORT,
  async fetch( req ){
    const path = decodeURIComponent( new URL( req.url ).pathname )

    // Reject traversal before it reaches the filesystem
    if( path.includes('..') ) return new Response('Forbidden', { status: 403 })

    const file = Bun.file( ROOT + ( path === '/' ? 'index.html' : path.slice( 1 ) ) )
    if( await file.exists() ) return new Response( file )

    // SPA fallback — the router owns the path
    return new Response( Bun.file( ROOT + 'index.html'), {
      headers: { 'content-type': 'text/html' }
    })
  }
})

console.log(`demo → http://localhost:${server.port}`)
