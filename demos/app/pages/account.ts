export default `
  <log( input.query )/>
  
  <section>
    User Account ID: <span @text=input.query.userid></span>
  </section>
`