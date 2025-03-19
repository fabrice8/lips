var q=Object.create;var{defineProperty:x,getPrototypeOf:t,getOwnPropertyNames:u}=Object;var w=Object.prototype.hasOwnProperty;var J=(a,b,r)=>{r=a!=null?q(t(a)):{};const d=b||!a||!a.__esModule?x(r,"default",{value:a,enumerable:!0}):r;for(let v of u(a))if(!w.call(d,v))x(d,v,{get:()=>a[v],enumerable:!0});return d};var K=(a)=>{return import.meta.require(a)};var g=(a,b)=>{for(var r in b)x(a,r,{get:b[r],enumerable:!0,configurable:!0,set:(d)=>b[r]=()=>d})};var h={};g(h,{stylesheet:()=>{{return C}},state:()=>{{return A}},handler:()=>{{return B}},default:()=>{{return D}},context:()=>{{return z}},_static:()=>{{return y}}});var y={limit:12},z=["lang"],A={count:0},B={onInput(){this.state.count=Number(this.input.initial)},handleClick(a){if(this.state.count>=this.static.limit)return;this.state.count++,this.emit("update",this.state.count)}},C=`
  span { font: 14px arial; color: blue; }
`,D=`<div>
  <span html=input.__innerHtml></span>: 
  <span text="state.count"></span>
  <br>
  <button on-click="handleClick">
    <span text="Count"></span>
    (<span text=context.lang></span>)
  </button>
</div>`;var j={};g(j,{stylesheet:()=>{{return F}},default:()=>{{return G}},context:()=>{{return E}}});var E=["getUser"],F=`
  * { font-family: helvetica }
`,G=`
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
`;var k={};g(k,{default:()=>{{return I}},_static:()=>{{return H}}});var H={content:"Nexted counter component"},I=`<p>
  <small style="color:gray" text=static.content>...</small>
</p>`;var M=(a)=>{a.register("counter",h),a.register("profile",j),a.register("footer",k)};export{M as default};

//# debugId=791CC06412CEBA7164756e2164756e21
