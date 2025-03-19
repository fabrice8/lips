var b=Object.create;var{defineProperty:s,getPrototypeOf:d,getOwnPropertyNames:m}=Object;var n=Object.prototype.hasOwnProperty;var p=(i,c,a)=>{a=i!=null?b(d(i)):{};const e=c||!i||!i.__esModule?s(a,"default",{value:i,enumerable:!0}):a;for(let r of m(i))if(!n.call(e,r))s(e,r,{get:()=>i[r],enumerable:!0});return e};var q=(i)=>{return import.meta.require(i)};var o=(i,c)=>{for(var a in c)s(i,a,{get:c[a],enumerable:!0,configurable:!0,set:(e)=>c[a]=()=>e})};var l={};o(l,{stylesheet:()=>{{return j}},state:()=>{{return g}},handler:()=>{{return h}},default:()=>{{return k}},context:()=>{{return f}},_static:()=>{{return v}}});var v={limit:12},f=["lang"],g={count:0},h={onInput(){this.state.count=Number(this.input.initial)},handleClick(i){if(this.state.count>=this.static.limit)return;this.state.count++,this.emit("update",this.state.count)}},j=`
  span { font: 14px arial; color: blue; }
`,k=`<div>
  <span html=input.__innerHtml></span>: 
  <span text="state.count"></span>
  <br>
  <button on-click="handleClick">
    <span text="Count"></span>
    (<span text=context.lang></span>)
  </button>
</div>`;export{j as stylesheet,g as state,h as handler,k as default,f as context,v as _static};

//# debugId=00DD985FFEDCC42064756e2164756e21
