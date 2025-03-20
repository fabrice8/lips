var a=Object.defineProperty;var c=(n,e)=>{for(var i in e)a(n,i,{get:e[i],enumerable:!0,configurable:!0,set:(s)=>e[i]=()=>s})};var u={};c(u,{stylesheet:()=>{{return p}},default:()=>{{return r}},context:()=>{{return g}}});var g=["getUser"],p=`
  * { font-family: helvetica }
`,r=`
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
`;export{p as stylesheet,r as default,g as context};

//# debugId=9EC54473E9C6156164756e2164756e21
