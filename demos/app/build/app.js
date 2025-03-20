var l=Object.defineProperty;var t=(e,i)=>{for(var n in i)l(e,n,{get:i[n],enumerable:!0,configurable:!0,set:(k)=>i[n]=()=>k})};var y={};t(y,{state:()=>{{return q}},handler:()=>{{return w}},default:()=>{{return x}},context:()=>{{return v}},_static:()=>{{return m}}});var o={};t(o,{default:()=>{{return G}}});var G=`
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
`;var b={};t(b,{default:()=>{{return R}}});var R=`
  <section>
    User Account ID: <span @text=input.query.userid></span>
  </section>
`;var f={};t(f,{default:()=>{{return j}},context:()=>{{return $}}});var $=["navigate"],j=`
  <section>
    <p>Product ID: <span @text=input.params.id></span></p>
    <p>Product Category: <span @text=input.query.category></span></p>

    <br>
    <button on-click(() => context.navigate('/') )>Go home</button>
  </section>
`;var m={routes:[{path:"/",template:o,default:!0},{path:"/account",template:b},{path:"/product/:id",template:f}]},q={initial:3},v=["online"],w={onRouteChange(...e){console.log("Route changed -- ",...e)},onPageNotFound(e){console.log(`<${e}> page not found`)}},x=`
<main>
  <router routes=static.routes
          global
          on-after(onRouteChange, 'after')
          on-before(onRouteChange, 'before')
          on-not-found(onPageNotFound)></router>
  
  <footer></footer>
</main>
`;export{q as state,w as handler,x as default,v as context,m as _static};

//# debugId=B513D80DCDAD80BD64756e2164756e21
