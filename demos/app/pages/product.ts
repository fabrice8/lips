export const context = ['navigate']

export default `
  <section>
    <p>Product ID: <span @text=input.params.id></span></p>
    <p>Product Category: <span @text=input.query.category></span></p>

    <br>
    <button on-click(() => context.navigate('/') )>Go home</button>
  </section>
`