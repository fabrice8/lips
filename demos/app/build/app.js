var b=Object.defineProperty;var i=(e,t)=>{for(var f in t)b(e,f,{get:t[f],enumerable:!0,configurable:!0,set:($)=>t[f]=()=>$})};var z={};i(z,{state:()=>{{return v}},handler:()=>{{return x}},default:()=>{{return y}},context:()=>{{return w}},_static:()=>{{return u}}});var l={};i(l,{default:()=>{{return j}}});var j=`
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
`;var n={};i(n,{default:()=>{{return k}}});var k=`
  <log( input.query )/>
  
  <section>
    User Account ID: <span @text=input.query.userid></span>
  </section>
`;var R={};i(R,{default:()=>{{return q}}});var q=`
  <section>
    <p>Product ID: <span @text=input.params.id></span></p>
    <p>Product Category: <span @text=input.query.category></span></p>
  </section>
`;var u={routes:[{path:"/",template:l,default:!0},{path:"/account",template:n},{path:"/product/:id",template:R}]},v={initial:3},w=["online"],x={onRouteChange(...e){console.log("Route changed -- ",...e)},onPageNotFound(e){console.log(`<${e}> page not found`)}},y=`
<main>
  <router routes=static.routes
          global
          on-after(onRouteChange, 'after')
          on-before(onRouteChange, 'before')
          on-not-found(onPageNotFound)></router>
  
  <footer></footer>
</main>
`;export{v as state,x as handler,y as default,w as context,u as _static};

//# debugId=6129371CCE366E3B64756e2164756e21
