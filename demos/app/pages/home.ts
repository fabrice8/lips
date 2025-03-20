export default `
  <section style="{ border: '2px solid gray', margin: '3rem', padding: '15px' }">
    <counter initial=state.initial
              on-update="value => console.log( value )">
      Count till 12
    </counter>

    <counter initial=1>
      Note: 10
    </counter>

    <p>I'm <span text="context.online ? 'Online' : 'Offline'"></span></p>

    <br><br>
    <button on-click="() => state.initial = 10">Reinitialize</button>
    <button title="Undo"
            style="background: black;color: white" 
            on-click="() => self.destroy()">Destroy</button>
    <br>
    <profile></profile>
  </section>
`