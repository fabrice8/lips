var x=Object.create;var{defineProperty:r,getPrototypeOf:a,getOwnPropertyNames:b}=Object;var d=Object.prototype.hasOwnProperty;var k=(u,e,c)=>{c=u!=null?x(a(u)):{};const o=e||!u||!u.__esModule?r(c,"default",{value:u,enumerable:!0}):c;for(let p of b(u))if(!d.call(o,p))r(o,p,{get:()=>u[p],enumerable:!0});return o};var l=(u)=>{return import.meta.require(u)};var f=(u,e)=>{for(var c in e)r(u,c,{get:e[c],enumerable:!0,configurable:!0,set:(o)=>e[c]=()=>o})};var j={};f(j,{stylesheet:()=>{{return h}},default:()=>{{return i}},context:()=>{{return g}}});var g=["getUser"],h=`
  * { font-family: helvetica }
`,i=`
<async await="context.getUser, 'Peter Giligous'">
  <preload>Preloading...</preload>
  <resolve>
    <div>
      <ul style="{ border: '1px solid black', padding: '15px' }">
        <li text=response.name></li>
        <li text=response.email></li>
      </ul>

      <counter initial=5 on-update="value => console.log('procount --', value )">By</counter>
    </div>
  </resolve>
  <catch><span text=error></span></catch>
</async>
`;export{h as stylesheet,i as default,g as context};

//# debugId=AF260DEA6AFD6FE464756e2164756e21
