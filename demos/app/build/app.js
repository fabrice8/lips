var j=Object.create;var{defineProperty:R,getPrototypeOf:k,getOwnPropertyNames:q}=Object;var v=Object.prototype.hasOwnProperty;var I=(e,l,i)=>{i=e!=null?j(k(e)):{};const n=l||!e||!e.__esModule?R(i,"default",{value:e,enumerable:!0}):i;for(let C of q(e))if(!v.call(n,C))R(n,C,{get:()=>e[C],enumerable:!0});return n};var J=(e)=>{return import.meta.require(e)};var y=(e,l)=>{for(var i in l)R(e,i,{get:l[i],enumerable:!0,configurable:!0,set:(n)=>l[i]=()=>n})};var H={};y(H,{state:()=>{{return D}},handler:()=>{{return F}},default:()=>{{return G}},context:()=>{{return E}},_static:()=>{{return B}}});var $={};y($,{default:()=>{{return w}}});var w=`
<section>
  Home
  <footer></footer>
</section>
`;var b={};y(b,{default:()=>{{return x}}});var x=`
<section>
  User Account ID: <span text=input.query.userid></span>
</section>
`;var f={};y(f,{default:()=>{{return z}}});var z=`
<section>
  <p>Product ID: <span text=input.params.id></span></p>
  <p>Product Category: <span text=input.query.category></span></p>
</section>
`;var B={routes:[{path:"/",template:$,default:!0},{path:"/account",template:b},{path:"/product/:id",template:f}]},D={initial:3},E=["online"],F={onRouteChange(...e){console.log("Route changed -- ",...e)},onPageNotFound(e){console.log(`<${e}> page not found`)}},G=`
<main>
  <router routes=static.routes
          global
          on-after="onRouteChange, 'after'"
          on-before="onRouteChange, 'before'"
          on-not-found="onPageNotFound"></router>

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
    <footer></footer>
  </section>
</main>
`;export{D as state,F as handler,G as default,E as context,B as _static};

//# debugId=264C54A22619E22F64756e2164756e21
