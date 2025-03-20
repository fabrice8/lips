var y=Object.defineProperty;var d=(a,u)=>{for(var b in u)y(a,b,{get:u[b],enumerable:!0,configurable:!0,set:(v)=>u[b]=()=>v})};var g={};d(g,{stylesheet:()=>{{return x}},state:()=>{{return q}},handler:()=>{{return w}},default:()=>{{return z}},context:()=>{{return k}},_static:()=>{{return j}}});var j={limit:12},k=["lang"],q={count:0},w={onInput(){this.state.count=Number(this.input.initial)},handleClick(a){if(this.state.count>=this.static.limit)return;this.state.count++,this.emit("update",this.state.count)}},x=`
  span { font: 14px arial; color: blue; }
`,z=`
  <div>
    <{input.renderer}/>: 
    <span @text=state.count></span>
    <br>
    <button on-click(handleClick)>
      <span @text="Count"></span>
      (<span @text=context.lang></span>)
    </button>
  </div>
`;var h={};d(h,{stylesheet:()=>{{return B}},default:()=>{{return D}},context:()=>{{return A}}});var A=["getUser"],B=`
  * { font-family: helvetica }
`,D=`
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
`;var t={};d(t,{default:()=>{{return F}},_static:()=>{{return E}}});var E={content:"Nexted counter component"},F=`
  <p>
    <small style="color:gray" @text=static.content>...</small>
  </p>
`;var H=(a)=>{a.register("counter",g),a.register("profile",h),a.register("footer",t)};export{H as default};

//# debugId=285D25E03B9E8E1F64756e2164756e21
