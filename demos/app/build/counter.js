var n=Object.defineProperty;var o=(a,t)=>{for(var u in t)n(a,u,{get:t[u],enumerable:!0,configurable:!0,set:(i)=>t[u]=()=>i})};var v={};o(v,{stylesheet:()=>{{return h}},state:()=>{{return d}},handler:()=>{{return e}},default:()=>{{return r}},context:()=>{{return b}},_static:()=>{{return p}}});var p={limit:12},b=["lang"],d={count:0},e={onInput(){this.state.count=Number(this.input.initial)},handleClick(a){if(this.state.count>=this.static.limit)return;this.state.count++,this.emit("update",this.state.count)}},h=`
  span { font: 14px arial; color: blue; }
`,r=`
  <div>
    <{input.renderer}/>: 
    <span @text=state.count></span>
    <br>
    <button on-click(handleClick)>
      <span @text="Count"></span>
      (<span @text=context.lang></span>)
    </button>
  </div>
`;export{h as stylesheet,d as state,e as handler,r as default,b as context,p as _static};

//# debugId=95BDA3BD5DA830E864756e2164756e21
