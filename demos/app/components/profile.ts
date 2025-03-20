
export const context = ['getUser']

export const stylesheet = `
  * { font-family: helvetica }
`

export default `
  <async await( context.getUser, 'Peter Giligous' )>
    <loading>Preloading...</loading>
    <then [response]>
      <div>
        <ul style="{ border: '1px solid black', padding: '15px' }">
          <li @text=response.name></li>
          <li @text=response.email></li>
        </ul>

        <counter initial=5 on-update(value => console.log('procount --', value ))>By</counter>
      </div>
    </then>
    <catch [error]><span @text=error></span></catch>
  </async>
`