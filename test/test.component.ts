import Lips, { Template, Handler, Metavars } from '../src/lips'
import english from '../languages/en.json'
import french from '../languages/fr.json'

const lips = new Lips({ debug: true })

function createEasyCount(){
  type TemplateInput = {
    initial: number
    limit: number
  }
  type TemplateState = {
    count: number
  }

  const easyCount: Template<Metavars<TemplateInput, TemplateState>> = {
    state: {
      count: 0
    },
    handler: {
      onInput(){
        if( this.input.initial !== undefined )
          this.state.count = Number( this.input.initial )
      },
      handleClick( e: Event ){
        if( this.state.count >= this.input.limit )
          return

        this.state.count++
        this.emit('count-change', this.state.count )
      }
    },
    default: `
      <div>
        <if( input.renderer )>
          <{input.renderer} count=state.count/>
        </if>
        <else><span @text=state.count></span></else>
        <br>
        <button i18n on-click( handleClick )>Count</button>
      </div>
    `
  }

  return easyCount
}

function DemoState(){
  type State = {
    name: string
    notes: Record<string, { attended: boolean, mark: number }>
    history: Array<{ id: string, status: 'missed' | 'completed' | 'ongoing', passed?: boolean }>
    dates: string[]
  }

  const
  state: State = {
    name: 'Frederick Aggee',
    notes: {
      french: {
        attended: true,
        mark: 12
      },
      physics: {
        attended: true,
        mark: 30
      }
    },
    history: [
      {
        id: 'text-1',
        status: 'missed',
        passed: false
      },
      {
        id: 'text-2',
        status: 'completed',
        passed: true
      }
    ],
    dates: [ '01/04/25', ]
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      setTimeout( () => {
        state.notes.french = {
          attended: true,
          mark: 100
        }
      }, 2000 )

      setTimeout( () => state.notes.french.mark = 60, 4000 )

      setTimeout( () => {
        state.history.push({
          id: 'text-3',
          status: 'ongoing'
        })
        state.dates = [ '01/04/25', '25/07/25', '12/11/25' ]
      }, 6000 )

      setTimeout( () => {
        state.history[2].status = 'completed'
        state.history[2].passed = true
      }, 8000 )
    }
  },
  template = `
    <div>
      <p>Student: {state.name}</p>
    
      <fieldset>
        <b>Notes</b>
        <for [topic, record] in=state.notes>
          <div>
            <label>{topic}</label>
            <ul>
              <li>Attended: {record.attended}</li>
              <li>Mark: {record.mark}</li>
            </ul>
          </div>
        </for>
      </fieldset>

      <fieldset>
        <b>History</b>
        <for [each, index] in=state.history>
          <ul>
            <li>ID: {each.id}</li>
            <li>Status: {each.status}</li>
            <li>Passed: {each.passed}</li>
          </ul>
        </for>
      </fieldset>

      <fieldset>
        <b>Dates</b>
        <p @html="state.dates.join('<br>')"></p>
      </fieldset>
    </div>
  `
  
  lips
  .render('DemoState', { default: template, state, handler })
  .appendTo('body')
}

function DemoContext(){
  const 
  config = {
    context: {
      online: true
    },
    debug: true
  },
  lips = new Lips( config )

  type Context = {
    online: boolean
  }

  const
  handler: Handler<Metavars<{}, {}, {}, Context>> = {
    onContext(){
      console.log('on-context --', this.context )
    },
    handleChangeStatus(){
      this.setContext('online', !this.context.online )
    }
  },
  template = `
    <main>
      <log('log context --', context.online )/>
      <p>I'm <span @text="{context.online ? 'Online' : 'Offline'}"/></p>
      
      <br>
      <button on-click(handleChangeStatus)>Go {!context.online ? 'Online' : 'Offline'}</button>
    </main>
  `

  lips
  .render('DemoContext', { default: template, handler, context: ['online'] })
  .appendTo('body')
  
  /**
   * Set context from lips instance
   */
  setTimeout( () => lips.setContext('online', false ), 2000 )
}

function DemoLetConstVariable(){
  type State = {
    price: number
    tax: number
  }

  const
  state: State = {
    price: 150,
    tax: 0.20
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      setTimeout( () => this.state.price = 80, 2000 )
      setTimeout( () => this.state.tax = 0.50, 4000 )
    }
  },
  template = `
    <!-- Out of context -->
    <span>-- Upper Total: \${total}</span>

    <ul style="list-style: none">
      <let total="state.price + (state.price * state.tax)"/>
      
      <li>Price: \${state.price}</li>
      <li>Tax: {state.tax * 100}%</li>
      <br>
      <li><b>Total</b>: \${total}</li>
    </ul>

    <!-- Closure vs initial rendering -->
    <span>-- Down Total: \${total}</span>
  `
  
  lips
  .render('DemoLetConstVariable', { default: template, state, handler })
  .appendTo('body')
}

function DemoMacro(){
  type Product = { name: string, expiry: string, source: string, quantity: number, active?: boolean }
  type State = {
    items: Array<Product>,
    selected: Product | null
  }

  const
  state: State = {
    items: [
      { name: 'Sudocream', expiry: '02/04/2026', source: 'phx', quantity: 12000 },
      { name: 'Thotheman', expiry: '02/04/2026', source: 'ernest', quantity: 8000 },
      { name: 'Paracetamol', expiry: '02/04/2026', source: 'fizzy.ph', quantity: 2500 },
      { name: 'Lumaterm', expiry: '02/04/2026', source: 'Landpharm', quantity: 6800 },
    ],
    selected: null
  },
  handler: Handler<Metavars<any, State>> = {
    onShowDetails( details: Product ){
      const item = this.state.items.find( each => each.name == details.name )
      if( !item ) throw new Error('Item not found')

      item.active = !item.active
      this.state.selected = item
    },
    onShowDetailsByIndex( index: number ){
      this.state.items[ index ].active = true
      this.state.selected = this.state.items[ index ]
    },
    onBuyProduct( product: Product ){
      console.log('BUY: ', product )
    }
  },
  macros = `
    <macro [name, source, active] name="card">
      <log( name, source, active, arguments )/>
      <div class="card"
            style="cursor:pointer; border: 1px solid {active ? '#000' : '#fff'}"
            on-click(onShowDetails, arguments )>
        <p>{name} <span style="color: gray">({source})</span></p>
      </div>
    </macro>

    <macro [name, source, quantity, expiry, active] name="details">
      <fieldset style="border: 1px solid {active ? '#000' : '#fff'}">
        <h2>{name}</h2>
        <small>Details</small>
        <ul>
          <li>Source: {source}</li>
          <li>Quantity: {quantity}</li>
          <li>Expr: {expiry}</li>
        </ul>

        <button style="background:#000;color:#fff" 
                on-click(onBuyProduct, arguments)>Buy</button>
      </fieldset>
    </macro>
  `,
  template = `
    <div>
      <div style="width: 25%">
        <h3>Pending Orders</h3>

        <for [each, index] in=state.items>
          <card id=index ...each active=(each.active ?? false)/>
        </for>
      </div>

      <div style="width: 75%">
        <if( state.selected )>
          <details ...state.selected/>
        </if>
      </div>
    </div>
  `,
  stylesheet = `
    display: flex;
    align-item: center;
    padding: 15px;
    margin: 15px;
    border: 3px solid black;
  `

  lips
  .render<Metavars<any, State>>('DemoMacro', { default: template, state, handler, macros, stylesheet })
  .appendTo('body')
}

function DemoComponent(){
  type State = {
    count: number
  }

  const
  template = `<div>
    <span @text=state.count></span>
    <br>
    <button on-click="handleClick">Count</button>
    <button on-click="() => self.destroy()">Destroy</button>
  </div>`,
  state: State = {
    count: 0
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      console.log('Component mounted')
    },
    onRender(){
      console.log('Component rendered')
    },
    onDestroy(){
      console.log('Component destroyed')
    },
    handleClick( e: Event ){
      this.state.count++
    }
  },
  stylesheet = `
    span, button { font: 14px arial; color: rgba(50, 50, 70); }
  `
  
  lips
  .render<Metavars<any, State>>('DemoComponent', { default: template, state, handler, stylesheet })
  .appendTo('body')
}

function DemoDynamicComponent(){
  const
  _static = {
    easycount: createEasyCount()
  },
  template = `
    <div>
      <p>Beat it</p>
      <{static.easycount} on-count-change( count => console.log('No.', count ) )/>

      <br>
      <p>Count it</p>
      <{static.easycount} [count]>
        <span>{count} - SQRT()</span> => <b> {Math.sqrt( count )}</b>
      </>
    </div>
  `
  
  lips
  .render('DemoDynamicComponent', { default: template, _static })
  .appendTo('body')
}

function DemoAsyncAwait(){
  type Static = {

  }
  
  const
  template = `
    <async await( getUser, static.name )>
      <loading>Loading...</loading>
      <then [response]>
        <ul>
          <log('async response --', response )/>
          <li>{response.name}</li>
          <li @text=response.email></li>
        </ul>
      </then>
      <catch [error]><span>{error}</span></catch>
      <finally><span>Completed</span></finally>
    </async>
  `,
  _static = {
    name: 'Peter Gibson'
  },
  handler: Handler<Metavars<any, any, Static>> = {
    getUser( name ){
      return new Promise( ( resolve, reject ) => {
        setTimeout( () => resolve({ name, email: 'g.peter@mail.com' }), 3000 )
        // setTimeout( () => reject('Unexpected error occured'), 1000 )
      })
    }
  }

  lips
  .render<Metavars<any, any, Static>>('Demo3', { default: template, _static, handler })
  .appendTo('body')
}

function DemoInterpolation(){
  const
  template = `
    <let country="Togo" capital="Lomè"></let>
    <div>
      <p>
        My country is {country}, 
        The capital of {country} is {capital}
      </p>

      <p>
        <const country="Ghana"></const>
        <!-- <const country="Kenya"></const> -->

        It borderd at west by <span @text=country></span>
      </p>

      <log( capital )/>
      <p>
        I'd love to go back to <span @text=capital></span> in December {new Date().getFullYear() + 1}
      </p>
    </div>`

  lips
  .render('Demo4', { default: template })
  .appendTo('body')
}

function DemoForloop(){
  type State = {
    numbers: number[]
  }

  const
  state: State = {
    numbers: [1,2,4,6,8,10,12]
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      setTimeout( () => this.state.numbers[2] = 11, 2000 )
      setTimeout( () => this.state.numbers[4] = 21, 4000 )
      setTimeout( () => this.state.numbers[0] = 0, 6000 )
      setTimeout( () => this.state.numbers[0] = 0, 8000 )
      setTimeout( () => { console.log('late mutation None --'); this.state.numbers[0] = 0 }, 10000 )
      setTimeout( () => { console.log('late mutation Chante --'); this.state.numbers[0] = 9 }, 15000 )
    }
  },
  template = `
    <log('numbers --', state.numbers )/>
    <for [n, idx] in=state.numbers>
      <let square="n * 4"/>
      #<span>[{idx}]-{n}({square})</span>.
    </for>
  `
  
  lips
  .render('DemoForloop', { default: template, state, handler })
  .appendTo('body')
}

function DemoForIfElse(){
  type State = {
    letters: string[]
  }

  const
  state: State = {
    letters: ['A','B','C','D','E','F']
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      setTimeout( () => this.state.letters = ['F','G','H','J', 'K', 'L', 'M', 'N'], 2000 )
      setTimeout( () => this.state.letters[3] = 'O', 6000 )
      setTimeout( () => this.state.letters = ['O', 'P', 'Q'], 80000 )
      setTimeout( () => this.state.letters = ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'], 10000 )
    }
  },
  template = `
    <for [each, idx] in=state.letters>
      <log( each )/>

      <if( idx % 3 )>
        <let composite="{each}{idx}"/>
        <div>#{composite}</div>
      </if>
      <else>
        <div>[{idx}] {each}</div>
      </else>
    </for>
  `
  
  lips
  .render('DemoForIfElse', { default: template, state, handler })
  .appendTo('body')
}

function DemoSyntaxInteract(){
  type TemplateInput = {
    initial: number
    limit: number
  }
  type TemplateState = {
    count: number
  }

  const easyCount: Template<Metavars<TemplateInput, TemplateState>> = {
    state: {
      count: 0
    },
    handler: {
      onInput(){ 
        this.state.count = Number( this.input.initial )
      
        // const end = setInterval( () => this.state.count++, 5 )
        // setTimeout( () => clearInterval( end ), 15000 )
      },
      handleClick( e: Event ){
        if( this.state.count >= this.input.limit )
          return

        this.state.count++
      }
    },
    default: `
      <div>
        <div>In component count: {state.count}</div>
        <if( input.renderer )>
          <{input.renderer} count=state.count/>
        </if>
        <br>
        <button on-click( handleClick )>Count</button>
      </div>
    `
  }

  lips.register('easycount', easyCount )

  type State = {
    value: string
    initial: number
    attrs: {
      hidden: boolean
      title: string
    }
    numbers: number[]
    speech: string
    traffic: 'red' | 'orange' | 'green'
  }

  const
  state: State = {
    value: 'logger',
    initial: 5,
    attrs: {
      hidden: true,
      title: 'Spread'
    },
    numbers: [1,2],
    speech: 'hi',
    traffic: 'orange'
  },
  handler: Handler<Metavars<any, State>> = {
    handleInput( e ){
      this.state.value = e.target.value
      this.state.attrs.hidden = e.target.value.length == 2

      if( e.target.value.length == 2 ){
        this.state.speech = 'hello'
        this.state.numbers = [0,5,3,6,2,3,6,7,4]
        this.state.traffic = 'red'
      }

      else if( e.target.value.length === 4 ){
        this.state.numbers = [4,3,2,3,3,32]
        this.state.speech = 'booz'
        this.state.traffic = 'green'
      }

      else this.state.traffic = 'orange'
    },
    getSum(){
      return {
        nbr: 20,
        read(){ return this.nbr },
        write( nbr: number ){ return this.nbr = nbr },
      } as any
    }
  },
  template = `
    <div style="border: 1px solid {state.value.length > 5 ? 'red' : 'gray'}">
      <input value=state.value
              on-input(handleInput)/>

      <br>
      <div @html=state.value style="color: green"></div>
      <p ...state.attrs checked on-click(() => console.log('I got clicked'))>
        <span>Major word in speech is: {state.speech} <span> - {state.value +'-plus'}</span></span>
        <br><br>
        <small>Initial count: {state.initial}</small>
      </p>

      <easycount [count] initial=state.initial>
        <span>{state.value}: {count}</span>
      </easycount>

      <p><small>Dynamic here</small></p>
      <{state.value === 'logger' ? 'easycount' : 'div'}/>
      
      <button on-click(() => self.state.initial = 2 )>Change initial</button>

      <br><br>
      <if( self.getSum() )>
        <let sum=self.getSum()/>
        <log('sum --', sum )/>

        <fieldset>
          <div>First read - {sum.read()}</div>
          <div>Write - {sum.write( 15 )}</div>
          <div>Then read again - {sum.read()}</div>
        </fieldset>
      </if>

      <br>
      <if( state.value.includes('b') )>
        <p><b>{state.value}</b></p>
      </if>
      <else-if( state.value.includes('i') )>
        <p><i>{state.value}</i></p>
      </else-if>
      <else-if( state.value.includes('u') )>
        <p><u>{state.value}</u></p>
      </else-if>

      <br>
      <for [n, idx] in=state.numbers>
        <let square=(idx * 4)/>
        #<span>[{idx}]-{n}({square})</span>.
      </for>

      <switch( state.traffic )>
        <case is="green">
          <div style="color: green;">Green light</div>
        </case>
        <case is="red">
          <div style="color: red;">Red light</div>
        </case>
        <default>
          <div style="color: orange;">Orange light</div>
        </case>
      </switch>
    </div>
  `

  lips
  .render('DemoSyntaxInteract', { default: template, state, handler }, {})
  .appendTo('body')
}

function createSpec(){
  type TemplateInput = {
    initial: number
    limit: number
  }
  type TemplateState = {
    count: number
  }

  const easyCount: Template<Metavars<TemplateInput, TemplateState>> = {
    state: {
      count: 0
    },
    handler: {
      onInput(){ console.log('spec input --', this.input ) }
    },
    default: `
      <fieldset on-click( () => self.emit('select') )>
        <h2 style="margin-top: 0">
          <span style="color: {input.active ? 'turquoise' : 'unset'}">{input.name}</span>
          <if( input.deprecated )><small style="color: orange"> (Deprecated)</small></if>
        </h2>
        <!-- <const ...static.vars></const> -->

        <ul>
          <li>Type: {input.type}</li>
          <li>Size: {input.size || '-'}</li>
          <li>Version: {input.version}</li>
          <li>
            Installed:
            <if( input.installed )>
              <span style="color: green">Yes</span>
            </if>
            <else><span style="color: gray">No</span></else>
          </li>
        </ul>
      </fieldset>
    `
  }

  return easyCount
}
function DemoAttrsPositioning(){
  lips.register('spec', createSpec() )

  const
  state = {
    specs: [
      { type: 'Lib', name: 'Request', version: '2.2.0', latest: '2.88.2', deprecated: true },
      { type: 'Framework', name: 'Lips', version: '1.0.0', size: '86kb', installed: true, active: true },
      { type: 'Framework', name: 'React', version: '4.9.0', latest: '19.1.0', size: '156kb', installed: false },
      { type: 'App', name: 'Chrome', version: '24.2.0', latest: '26.1.11', size: '132Mb', deprecated: false },
      { type: 'OS', name: 'Ubuntu', size: '2.4Gb', deprecated: true }
    ],
    version: '10.10.1',
    selected: null
  },
  handler: Handler<Metavars<any, any>> = {
    onSelect( index ){
      this.state.selected = index
    },
    getSpecs( index ){
      return this.state.specs[ index ]
    },
    onInstall( index, version ){
      this.state.specs[ index ].installed = true
      this.state.version = version
    },
    onUninstall( index, version ){
      this.state.specs[ index ].installed = false
      this.state.version = null
    },
    onUpgrade( index, partial = false ){
      this.state.version = this.state.specs[ index ].latest
      
      if( partial === false ){
        this.state.specs[ index ].version = this.state.specs[ index ].latest
        this.state.specs[ index ].upgraded = true
      }
    }
  },
  template = `
    <ul style="list-type: none">
      <for [index] from=0 to=(state.specs.length - 1)>
        <li style="border: 4px solid {state.selected === index ? 'turquoise' : 'black'}; margin: 5px 0;">
          <let specs=self.getSpecs( index )/>

          <spec version=state.version
                ...specs
                active=(state.selected === index)
                on-select( onSelect, index )/>

          <div style="display: flex; align-items: center; justify-content: between;padding: 10px;">
            <let version=state.version active=(state.selected === index)/>
            
            <if( !specs.installed )>
              <button on-click( onInstall, index, specs.version )>Install {specs.name +(specs.version ? '~'+ specs.version : '')}</button>
            </if>
            <else>
              <button on-click( onUninstall, index, specs.version )>Uninstall {specs.name +(specs.version ? '~'+ specs.version : '')}</button>
            </else>

            <if( active )>
              <small style="padding: 0 10px;">Selected</small>
            </if>
            
            <if( specs.installed && !specs.upgraded && specs.latest )>
              <div style="padding: 0 100px">
                <span>Version {specs.latest} available!</span>
                
                <if( state.version === specs.latest )>
                  <span style="padding: 0 10px;color: orange">Mounted</span>
                </if>
                <else>
                  <button style="margin: 0 10px" on-click( onUpgrade, index, true )>Mount</button>
                </else>

                <button style="margin: 0 10px" on-click( onUpgrade, index, false )>Upgrade</button>
              </div>
            </if>
          </div>
        </li>
      </for>
    </ul>
  `

  lips.root({ default: template, state, handler }, 'body')
}

function DemoI18n(){
  type State = {
    name: string,
    translate: boolean
    reply: boolean
    keywords: string[]
  }

  lips.i18n.setDictionary('en', english )
  lips.i18n.setDictionary('fr', french )

  const
  keywords = [
    'Undo',
    'Redo',
    'Reinitialize',
    'Settings',
    'Link',
    'Device Screens'
  ],
  state: State = {
    name: 'Dilan',
    translate: false,
    reply: false,
    keywords
  },
  handler: Handler<Metavars<any, State>> = {
    onTranslateChange(){
      this.state.translate = !this.state.translate
    },
    onReply(){
      this.state.reply = !this.state.reply
    },
    onChangeLanguage( lang: string ){
      console.log('set-language --', lang )
      this.lips.setLanguage( lang )
    },
    onHandleKeywords(){
      this.state.keywords = !this.state.keywords.length ? keywords : []
    }
  },
  template = `
    <p @format="welcome_user, { name: state.name }"></p>

    <if( state.reply )>
      <p i18n>I guess all is well.</p>
    </if>

    <b @format="keywords_count, { count: state.keywords.length }"></b>
    <ul>
      <for [keyword] in=state.keywords>
        <if( state.translate )><li i18n>{keyword}</li></if>
        <else><li>{keyword}</li></else>
      </for>
    </ul>

    <br>
    <button on-click(onReply) i18n>Reply</button>
    <button on-click(onTranslateChange) @format="translate_button, { translate: state.translate }"></button>
    <button on-click(onHandleKeywords) i18n>{state.keywords.length ? 'Clear' : 'Reset'} keywords</button>

    <br><br>
    <button on-click(onChangeLanguage, 'en-US')>English (US)</button>
    <button on-click(onChangeLanguage, 'en-UK')>English (UK)</button>
    <button on-click(onChangeLanguage, 'fr-FR')>French</button>
  `
  
  lips
  .render('DemoI18n', { default: template, state, handler })
  .appendTo('body')
}

// DemoState()
// DemoContext()
// DemoForloop()
// DemoForIfElse()
DemoMacro()
// DemoComponent()
// DemoAsyncAwait()
// DemoInterpolation()
// DemoSyntaxInteract()
// DemoLetConstVariable()
// DemoDynamicComponent()
// DemoAttrsPositioning()
// DemoI18n()

/**
 * -------------------------------------------------------------------------
 * Mini applications demo 
 */

function DemoDeepNexted(){
  type Input = {
    person: string
    default?: string
  }
  type State = {
    time: string
    speech: string
    online: boolean
  }
  type Static = {
    [index: string]: any
  }

  const
  template = `<div component="Greet" style="!state.online && 'color: red'">
      <span @text=input.person>me</span>:
      (<span @text="state.online ? 'Online' : 'Offline'"></span>)
      <span @text=static.verb>...</span>

      <div>
        <for [x] from="0" to="2">
          <if( state.time == 'morning' )>
            <switch( state.speech )>
              <case is="hi">
                <span on-click(handleConnect, !state.online)>Hi - </span>
                <span @text=x></span>
              </case>
              <case is="hello">
                <span>Hello - </span>
                <span>{x}</span>
              </case>
              <case is="bonjour">
                <span>Bonjour - </span>
                <span>{x}</span>
              </case>
              <default>Salut</default>
            </switch>
            <div>Static content</div>
          </if>
          <else-if( state.time == 'afternoon' )>
            <span on-click(handleConnect, !state.online)>Good afternoon - </span>
            <span>{x}</span>
          </else-if>
          <else>
            <span @text=input.default on-click(handleConnect, !state.online)></span>
            <span @html="<b>Everyone</b>"></span>
          </else>
        </for>
      </div>

      <ul>
        <for [continent, users] in=static.users>
          <li key=continent>
            <span @text=continent>Frederic Dupont</span>:
            <ul>
              <for [user, userid] in=users>
                <li key=userid>
                  <span @text=user.name>Frederic Dupont</span> - 
                  <span @text=user.location>Nice, Belogre</span>
                </li>
              </for>
            </ul>
          </li>
        </for>
      </ul>
    </div>`,
  state: State = {
    time: 'morning',
    speech: 'hi',
    online: true
  },
  input: Input = {
    person: 'Bob',
    default: 'Good evening'
  },
  _static: Static = {
    verb: 'Say',
    users: {
      Europe: [
        { name: 'Xavier des Rouseaux', location: 'Pincier, Toulouse' },
        { name: 'Frank Peterson', location: 'Greenville, London' }
      ],
      Africa: [
        { name: 'Ebu Sepegna', location: 'Keta, Volta' },
        { name: 'Gadje Ama', location: 'Ougbo, Plateaux' },
        { name: 'Albert Kefas', location: 'Gamba, Ndjamena' }
      ]
    }
  },
  handler: Handler<Metavars<Input, State, Static>> = {
    handleConnect( online: boolean, e: Event ){
      console.log('Connected: ', online, e )

      this.state.online = online
      this.state.time = !online ? 'evening' : 'morning'
      
      // this.setState({ online, time: 'evening' })
      // console.log('Updated to: ', this.state.online )
    }
  }

  const
  component = lips
              .render('DemoDeepNexted', { default: template, state, _static, handler }, input )
              .appendTo('body')

  setTimeout( () => {
    component.state.time = 'afternoon'
    component.state.online = false
    component.state.speech = 'bonjour'

    component.setInput({ person: 'Brigit' })
  }, 2000 )
}

function DemoSubcomponent(){
  lips.register('easycount', createEasyCount() )

  const
  _static = {
    vars: { type: 'UI Framework', name: 'Lips', version: '1.0.0' }
  },
  handler: Handler<Metavars<any>> = {
    initcount(){
      // Do something ...

      return {
        initial: 5,
        limit: 10
      }
    }
  },
  template = `
    <div>
      <easycount ...self.initcount()></easycount>

      <const ...static.vars></const>
      <ul>
        <li>Type: {type}</li>
        <li>Name: {name}</li>
        <li>Version: {version}</li>
      </ul>
    </div>
  `

  lips.root({ default: template, _static, handler }, 'body')
}

function DemoManyComponent(){
  type TemplateInput = {
    initial: number
  }
  type TemplateState = {
    count: number
  }
  type TemplateStatic = {
    limit: number
  }

  const cp: Template<Metavars<TemplateInput, TemplateState, TemplateStatic>> = {
    state: {
      count: 0
    },
    handler: {
      onInput(){ 
        this.state.count = Number( this.input.initial )
      
        // const end = setInterval( () => {
        //   this.state.count++
        //   this.emit('update', this.state.count )
        // }, 1 )
        // setTimeout( () => clearInterval( end ), 5000 )
      },
      handleClick( e: Event ){
        if( this.state.count >= this.static.limit )
          return

        this.state.count++
        this.emit('update', this.state.count )
      }
    },
    _static: {
      limit: 12
    },
    stylesheet: `
      span { font: 14px arial; color: blue; }
    `,
    
    default: `
      <div>
        <{input.renderer}/>: 
        <span @text=state.count></span>
        <br>
        <button i18n on-click(handleClick)>Count</button>
      </div>
    `
  }

  const 
  config = {
    context: {
      lang: 'en-US',
      online: true
    },
    debug: true
  },
  lips = new Lips( config )

  lips.register('counter', cp )
  // await lips.register('caption', '../../examples/active-modela/components/caption')

  lips.i18n.setDictionary('en', english )
  lips.i18n.setDictionary('fr', french )

  type State = {
    initial: number
    countUpdate: number
  }

  const
  state: State = {
    initial: 3,
    countUpdate: 0
  },
  handler: Handler<Metavars<any, State>> = {
    onMount(){
      this.node.css({ color: 'green' })
      
      console.log('State: ', this.state.initial )
    },
    onUpdateCount( value ){
      this.state.countUpdate = value
    },
    onContext(){
      console.log('on-context --', this.context )
    }
  },
  template = `
    <main>
      <section style="border: 2px solid gray; margin: 3rem; padding: 15px">
        <counter initial=state.initial
                  on-update="onUpdateCount">
          Count till 12
        </counter>

        <counter initial=1>Number</counter>

        <log('online context --', context.online )/>
        <p>I'm <span @text="{context.online ? 'Online' : 'Offline'}"/></p>
        
        <br><br>
        <button on-click(() => state.initial = 10)>Reinitialize ({state.countUpdate})</button>
        <button i18n style="background: black;color: white"
                on-click(() => self.destroy())>Destroy</button>

        <caption/>
      </section>
    </main>
  `

  lips
  .render('DemoManyComponent', { default: template, state, handler, context: ['online'] }, {} )
  .appendTo('body')

  // Change detault translation language
  setTimeout( () => {
    lips.setLanguage('fr-FR')
    lips.setContext('online', false )
  }, 5000 )
}

function DemoShoppingCart(){
  type CartItem = {
    id: number
    name: string
    price: number
    quantity: number
  }

  type CartInput = {
    key: string
  }

  type CartState = {
    items: CartItem[]
  }

  const state: CartState = {
    items: [
      { id: 1, name: "Apple", price: 0.5, quantity: 1 },
      { id: 2, name: "Banana", price: 0.3, quantity: 2 },
      { id: 3, name: "Orange", price: 0.6, quantity: 1 }
    ]
  }

  const handler: Handler<Metavars<CartInput, CartState>> = {
    onIncrementQuantity(itemId: number) {
      this.state.items = this.state.items.map(item =>
        item.id === itemId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )

      console.log('inc --', itemId, this.state.items.toJSON() )
    },

    onDecrementQuantity(itemId: number) {
      this.state.items = this.state.items.map(item =>
        item.id === itemId && item.quantity > 0
          ? { ...item, quantity: item.quantity - 1 }
          : item
      )

      // console.log('dec --', itemId, this.state.items.toJSON() )
    },

    getTotalItems() {
      return this.state.items.reduce((sum, item) => sum + item.quantity, 0)
    },

    getSubtotal() {
      return this.state.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    },

    getTax() {
      return this.getSubtotal() * 0.1
    },

    getTotal() {
      return this.getSubtotal() + this.getTax()
    }
  }

  const macros = `
    <macro [id, name, price, quantity] name="item">
      <div key=id class="cart-item">
        <log( id, name, price, quantity )/>
      
        <div class="item-info">
          <h3>{name}</h3>
          <p class="item-price">{price.toFixed(2)} each</p>
        </div>
        
        <div class="quantity-controls">
          <mbutton 
            class="quantity-btn"
            on-click(onDecrementQuantity, id)>-</mbutton>
          <span class="quantity-value">{quantity}</span>
          <mbutton 
            class="quantity-btn"
            on-click(onIncrementQuantity, id)>+</mbutton>
        </div>
      </div>
    </macro>

    <macro name="tax">
      <span>Tax (10%):</span>
      <span>{self.getTax().toFixed(2)}</span>
    </macro>
  `

  const template = `
    <div class="cart-container">
      <h2 class="cart-title">Shopping Cart</h2>
      
      <div class="cart-items">
        <for [each] in=state.items>
          <item ...each/>
        </for>
      </div>
      
      <div class="cart-summary">
        <div class="summary-row">
          <span>Total Items:</span>
          <span>{self.getTotalItems()}</span>
        </div>
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>{self.getSubtotal().toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <tax/>
        </div>
        
        <div class="summary-row summary-total">
          <span>Total:</span>
          <span>{self.getTotal().toFixed(2)}</span>
        </div>
      </div>
    </div>
  `

  const stylesheet = `
    .cart-container {
      padding: 1rem;
      max-width: 28rem;
      margin: 0 auto;
      background-color: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }

    .cart-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .cart-items {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .cart-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.5rem;
    }

    .item-info h3 {
      font-weight: 500;
      margin: 0;
    }

    .item-price {
      color: #4b5563;
    }

    .quantity-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .quantity-btn {
      padding: 0.25rem 0.5rem;
      background-color: #e5e7eb;
      border: none;
      border-radius: 0.25rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .quantity-btn:hover {
      background-color: #d1d5db;
    }

    .quantity-value {
      width: 2rem;
      text-align: center;
    }

    .cart-summary {
      margin-top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
    }

    .summary-total {
      font-weight: 700;
      padding-top: 0.5rem;
      margin-top: 0.5rem;
      border-top: 2px solid #e5e7eb;
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .cart-container {
        margin: 1rem;
        width: auto;
      }
    }
  `

  const input = { key: 'shopping-cart' }
  
  lips
  .render<Metavars<CartInput, CartState>>('DemoCart', { default: template, state, handler, stylesheet, macros }, input )
  .appendTo('body')
}

// DemoDeepNexted()
// DemoSubcomponent()
// DemoManyComponent()
// DemoShoppingCart()

/**
 * ------------------------------------------------------------------------- 
 * Animation Demos
 */

function WaveGraphDemo() {
  // Types for our wave graph component
  type WaveGraphInput = {
    title?: string
    width?: number
    height?: number
    pointCount?: number
    animationSpeed?: number
    lineColor?: string
    backgroundColor?: string
  }

  type WaveGraphState = {
    points: Array<{x: number, y: number}>
    animationFrame: number
    isRunning: boolean
    amplitude: number
    frequency: number
    phase: number
  }

  // Default input values
  const DEFAULT_INPUT: WaveGraphInput = {
    title: "Interactive Wave Graph",
    width: 800,
    height: 400,
    pointCount: 100,
    animationSpeed: 50,
    lineColor: "#3498db",
    backgroundColor: "#f8f9fa"
  }

  // Create the wave graph component template
  const waveGraph: Template<Metavars<WaveGraphInput, WaveGraphState>> = {
    state: {
      points: [],
      animationFrame: 0,
      isRunning: false,
      amplitude: 100,
      frequency: 0.05,
      phase: 0
    },
    handler: {
      // Initialize the component
      onCreate() {
        // Set default values for undefined inputs
        if (!this.input.width) this.input.width = DEFAULT_INPUT.width
        if (!this.input.height) this.input.height = DEFAULT_INPUT.height
        if (!this.input.title) this.input.title = DEFAULT_INPUT.title
        if (!this.input.pointCount) this.input.pointCount = DEFAULT_INPUT.pointCount
        if (!this.input.animationSpeed) this.input.animationSpeed = DEFAULT_INPUT.animationSpeed
        if (!this.input.lineColor) this.input.lineColor = DEFAULT_INPUT.lineColor
        if (!this.input.backgroundColor) this.input.backgroundColor = DEFAULT_INPUT.backgroundColor
        
        // Initialize the points array
        this.generatePoints()
      },
      
      // When component mounts, start the animation
      onMount() {
        // Do an initial manual point generation to ensure we have points
        this.generatePoints()
        
        // Log the initial state to verify points were generated
        console.log("Initial points:", this.state.points.length, 
                    "First point:", this.state.points[0],
                    "Last point:", this.state.points[this.state.points.length-1])
        
        setTimeout(() => {
          this.startAnimation()
        }, 500) // Small delay to ensure initial render is complete
      },
      
      // Cleanup when component is destroyed
      onDestroy() {
        this.stopAnimation()
      },
      
      // Generate wave points
      generatePoints() {
        const { width, height, pointCount } = this.input
        const { amplitude, frequency, phase } = this.state

        if( width === undefined 
            || height === undefined
            || pointCount === undefined ) return
        
        const points: Array<{ x: number, y: number }> = []
        const step = width / (pointCount - 1)
        
        for (let i = 0; i < pointCount; i++) {
          const x = i * step
          const y = amplitude * Math.sin(frequency * x + phase) + (height / 2)
          points.push({ x, y })
        }
        
        this.state.points = points
      },
      
      // Start the animation loop
      startAnimation() {
        if (this.state.isRunning) return
        
        this.state.isRunning = true
        
        const animate = () => {
          if (!this.state.isRunning) return
          
          // Update phase to create the animation effect
          this.state.phase += 0.1
          this.generatePoints()
          
          // Schedule the next frame
          if( !this.input.animationSpeed ) return

          setTimeout(() => {
            this.state.animationFrame = requestAnimationFrame(animate)
          }, 1000 / this.input.animationSpeed)
        }
        
        this.state.animationFrame = requestAnimationFrame(animate)
      },
      
      // Stop the animation loop
      stopAnimation() {
        this.state.isRunning = false
        cancelAnimationFrame(this.state.animationFrame)
      },
      
      // Toggle the animation
      toggleAnimation() {
        if (this.state.isRunning) {
          this.stopAnimation()
        } else {
          this.startAnimation()
        }
      },
      
      // Increase amplitude
      increaseAmplitude() {
        if( this.input.height === undefined ) return

        this.state.amplitude = Math.min(this.state.amplitude + 10, this.input.height / 2 - 10)
        this.generatePoints()
      },
      
      // Decrease amplitude
      decreaseAmplitude() {
        this.state.amplitude = Math.max(this.state.amplitude - 10, 10)
        this.generatePoints()
      },
      
      // Increase frequency
      increaseFrequency() {
        this.state.frequency += 0.01
        this.generatePoints()
      },
      
      // Decrease frequency
      decreaseFrequency() {
        this.state.frequency = Math.max(this.state.frequency - 0.01, 0.01)
        this.generatePoints()
      },
      
      // Generate SVG path from points with explicit formatting
      generatePath() {
        const points = this.state.points
        if (!points.length) return ""
        
        // Format numbers with fixed precision to avoid SVG parsing issues
        let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
        
        for (let i = 1; i < points.length; i++) {
          path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
        }
        
        // Log the first part of the path for debugging
        // console.log("Path data (first 100 chars):", path.substring(0, 100) + "...")
        
        return path
      },
      
      // Add a debug helper that returns a static path for testing
      getDebugPath() {
        const { width, height } = this.input
        if( width === undefined || height === undefined ) return

        const midY = height / 2
        
        // Simple sine wave path with fixed coordinates
        return `M 0 ${midY} L ${width/10} ${midY-50} L ${width/5} ${midY} L ${width/3.3} ${midY+50} L ${width/2.5} ${midY} L ${width/2} ${midY-50} L ${width/1.5} ${midY} L ${width/1.25} ${midY+50} L ${width} ${midY}`
      },
      
      // Helper to create a unique pattern ID to avoid conflicts when multiple graphs are used
      getPatternId() {
        return "grid-"+ (this.input.title || "").replace(/\s+/g, '-').toLowerCase()
      }
    },
    
    // The component template with correct Lips syntax
    default: `
      <div class="wave-graph-container" style="width: {input.width + 40}px; background-color: {input.backgroundColor}">
        <h2 class="wave-graph-title">{input.title}</h2>
        
        <svg class="wave-graph-svg" 
            width=input.width 
            height=input.height 
            viewBox="'0 0 '+ input.width +' '+ input.height">
          <!-- Background grid -->
          <defs>
            <pattern id=self.getPatternId() width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e0e0e0" stroke-width="1"></path>
            </pattern>
          </defs>

          <let patternid=self.getPatternId()/>
          <rect width=input.width height=input.height fill="'url(#'+ patternid +')'" />
          
          <!-- Center horizontal line -->
          <line x1="0" y1=(input.height / 2) x2=input.width y2=(input.height / 2) 
                stroke="#ccc" stroke-width="1" stroke-dasharray="5,5" />
          
          <!-- Debug static path first to verify SVG is working -->
          <path d=self.getDebugPath() fill="none" stroke="red" stroke-width="3" />
          
          <!-- The dynamic wave path -->
          <path d=self.generatePath() fill="none" stroke=input.lineColor stroke-width="2.5" vector-effect="non-scaling-stroke" />
          
          <!-- Points on the wave -->
          <for [point, idx] in=state.points>
            <if(idx % 10 === 0)>
              <circle cx=point.x cy=point.y r="3" fill=input.lineColor />
            </if>
          </for>
        </svg>
        
        <div class="wave-graph-controls">
          <button class="wave-graph-button {state.isRunning ? 'stop' : ''}" 
                  on-click(toggleAnimation)>
            {state.isRunning ? 'Pause' : 'Start'} Animation
          </button>
          
          <button class="wave-graph-button" on-click(increaseAmplitude)>
            Increase Amplitude
          </button>
          
          <button class="wave-graph-button" on-click(decreaseAmplitude)>
            Decrease Amplitude
          </button>
          
          <button class="wave-graph-button" on-click(increaseFrequency)>
            Increase Frequency
          </button>
          
          <button class="wave-graph-button" on-click(decreaseFrequency)>
            Decrease Frequency
          </button>
        </div>
        
        <div class="wave-graph-info">
          <div class="wave-graph-info-item">Status: <b>{state.isRunning ? 'Running' : 'Paused'}</b></div>
          <div class="wave-graph-info-item">Amplitude: <b>{state.amplitude.toFixed(2)}</b></div>
          <div class="wave-graph-info-item">Frequency: <b>{state.frequency.toFixed(4)}</b></div>
          <div class="wave-graph-info-item">Points: <b>{state.points.length}</b></div>
          <div class="wave-graph-info-item">Point Example: <b>{state.points.length > 0 ? state.points[0].x.toFixed(1) +', '+ state.points[0].y.toFixed(1) : 'None'}</b></div>
          <div class="wave-graph-info-item">Path Length: <b>{self.generatePath().length}</b> chars</div>
        </div>
      </div>
    `,

    // CSS styles for the wave graph
    stylesheet: `
      .wave-graph-container {
        font-family: Arial, sans-serif;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        margin: 20px auto;
        overflow: hidden;
      }
      
      .wave-graph-title {
        font-size: 18px;
        margin-bottom: 15px;
        color: #333;
      }
      
      .wave-graph-svg {
        display: block;
        border-radius: 4px;
        margin-bottom: 15px;
      }
      
      .wave-graph-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 15px;
      }
      
      .wave-graph-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background-color: #3498db;
        color: white;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .wave-graph-button:hover {
        background-color: #2980b9;
      }
      
      .wave-graph-button.stop {
        background-color: #e74c3c;
      }
      
      .wave-graph-button.stop:hover {
        background-color: #c0392b;
      }
      
      .wave-graph-info {
        background-color: #f1f1f1;
        padding: 12px;
        border-radius: 4px;
        font-size: 14px;
      }
      
      .wave-graph-info-item {
        margin-bottom: 5px;
      }
    `
  }

  const lips = new Lips({ debug: true })
  
  // Register the wave graph component
  lips.register('wave-graph', waveGraph)
  
  // Create a demo app that uses multiple wave graphs
  const demoApp: Template<Metavars<{}, {}>> = {
    default: `
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
        <h1>Wave Graph Demonstration</h1>
        <p>This demo shows interactive wave graphs with real-time animations and controls.</p>
        
        <div style="display: flex; flex-direction: column; gap: 30px;">
          <!-- Default wave graph -->
          <wave-graph />
          
          <!-- Customized wave graphs -->
          <wave-graph 
            title="Fast Oscillating Wave" 
            width="600" 
            height="300"
            pointCount="150"
            animationSpeed="100"
            lineColor="#e74c3c"
            backgroundColor="#f7f9fa" />
            
          <wave-graph
            title="Slow Motion Wave"
            width="600"
            height="200"
            pointCount="80" 
            animationSpeed="20"
            lineColor="#27ae60"
            backgroundColor="#f0f0f0" />
        </div>
      </div>
    `
  }
  
  // Render the demo app
  lips.render('WaveGraphDemo', demoApp).appendTo('body')
}

function AnimationDemo() {
  type AnimatedCircleState = {
    x: number
    y: number
    direction: number
    isRunning: boolean
    timerId: number
  }

  // This component will animate a circle moving across the screen
  // Much simpler than a wave to isolate if animation works at all
  const animatedCircle: Template<Metavars<{}, AnimatedCircleState>> = {
    state: {
      x: 50,
      y: 100,
      direction: 1,
      isRunning: false,
      timerId: 0
    },
    handler: {
      onMount() {
        // Start animation immediately
        this.startAnimation();
      },
      
      onDestroy() {
        // Clean up
        this.stopAnimation();
      },
      
      startAnimation() {
        if (this.state.isRunning) return;
        
        this.state.isRunning = true;
        
        // Use setInterval instead of requestAnimationFrame for simplicity
        this.state.timerId = window.setInterval(() => {
          // Move the circle
          this.state.x += 5 * this.state.direction;
          
          // Reverse direction if we hit the edge
          if (this.state.x > 350 || this.state.x < 50) {
            this.state.direction *= -1;
          }
          
          // Force a log to verify updates are happening
          console.log("Circle position:", this.state.x);
        }, 100); // Update every 100ms
      },
      
      stopAnimation() {
        if (!this.state.isRunning) return;
        
        window.clearInterval(this.state.timerId);
        this.state.isRunning = false;
      },
      
      toggleAnimation() {
        if (this.state.isRunning) {
          this.stopAnimation();
        } else {
          this.startAnimation();
        }
      }
    },
    default: `
      <div style="padding: 20px; border: 2px solid #333; margin: 20px;">
        <h2>Simple Circle Animation</h2>
        <p>Current X: {state.x}, Direction: {state.direction}</p>
        
        <svg width="400" height="200" style="border: 1px solid #ccc; background-color: #f0f0f0;">
          <!-- Static reference line -->
          <line x1="0" y1="100" x2="400" y2="100" stroke="#ccc" stroke-width="1" />
          
          <!-- Animated circle -->
          <circle cx=state.x cy=state.y r="20" fill="red" />
        </svg>
        
        <button style="margin-top: 10px; padding: 5px 10px;" on-click(toggleAnimation)>
          {state.isRunning ? 'Pause' : 'Start'}
        </button>
      </div>
    `
  };
  
  type ColorChangingRectState = {
    colors: string[]
    currentIndex: number
    isRunning: boolean
    timerId: number
  }

  // Very basic SVG with just rectangles that change color
  const colorChangingRects: Template<Metavars<{}, ColorChangingRectState>> = {
    state: {
      colors: ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"],
      currentIndex: 0,
      isRunning: false,
      timerId: 0
    },
    handler: {
      onMount() {
        this.startAnimation();
      },
      
      onDestroy() {
        this.stopAnimation(); 
      },
      
      startAnimation() {
        if (this.state.isRunning) return;
        
        this.state.isRunning = true;
        
        this.state.timerId = window.setInterval(() => {
          this.state.currentIndex = (this.state.currentIndex + 1) % this.state.colors.length;
          console.log("Color index:", this.state.currentIndex);
        }, 1000);
      },
      
      stopAnimation() {
        window.clearInterval(this.state.timerId);
        this.state.isRunning = false;
      },
      
      getColor(offset) {
        const index = (this.state.currentIndex + offset) % this.state.colors.length;
        return this.state.colors[index];
      }
    },
    default: `
      <div style="padding: 20px; border: 2px solid #333; margin: 20px;">
        <h2>Color Changing Rectangles</h2>
        <p>Current color index: {state.currentIndex}</p>
        
        <svg width="400" height="100" style="border: 1px solid #ccc; background-color: #f0f0f0;">
          <rect x="10" y="10" width="70" height="80" fill=self.getColor(0) />
          <rect x="90" y="10" width="70" height="80" fill=self.getColor(1) />
          <rect x="170" y="10" width="70" height="80" fill=self.getColor(2) />
          <rect x="250" y="10" width="70" height="80" fill=self.getColor(3) />
          <rect x="330" y="10" width="70" height="80" fill=self.getColor(4) />
        </svg>
      </div>
    `
  };
  
  type HTMLCounterState = {
    count: number
    isRunning: boolean
    timerId: number
  }

  // Plain HTML animation with no SVG
  const htmlCounter: Template<Metavars<{}, HTMLCounterState>> = {
    state: {
      count: 0,
      isRunning: false,
      timerId: 0
    },
    handler: {
      onMount() {
        this.startCounting();
      },
      
      onDestroy() {
        this.stopCounting();
      },
      
      startCounting() {
        if (this.state.isRunning) return;
        
        this.state.isRunning = true;
        
        this.state.timerId = window.setInterval(() => {
          this.state.count++;
          console.log("Count:", this.state.count);
        }, 1000);
      },
      
      stopCounting() {
        window.clearInterval(this.state.timerId);
        this.state.isRunning = false;
      },
      
      toggleCounting() {
        if (this.state.isRunning) {
          this.stopCounting();
        } else {
          this.startCounting();
        }
      }
    },
    default: `
      <div style="padding: 20px; border: 2px solid #333; margin: 20px;">
        <h2>Simple HTML Counter</h2>
        
        <div style="font-size: 48px; text-align: center; padding: 20px; background-color: #f0f0f0;">
          {state.count}
        </div>
        
        <button style="margin-top: 10px; padding: 5px 10px;" on-click(toggleCounting)>
          {state.isRunning ? 'Pause' : 'Start'}
        </button>
      </div>
    `
  };
  
  const lips = new Lips({ debug: true });
  
  // Register all components
  lips.register('animated-circle', animatedCircle);
  lips.register('color-rects', colorChangingRects);
  lips.register('html-counter', htmlCounter);
  
  // Create a test app with all three components
  const app: Template<Metavars<{}, {}>> = {
    default: `
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px;">
        <h1>Animation Tests</h1>
        <p>Testing different animation approaches with Lips</p>
        
        <!-- Test 1: HTML Count -->
        <!-- <html-counter/> -->

        <!-- Test 2: SVG with color changes -->
        <!-- <color-rects/> -->
        
        <!-- Test 3: SVG with position animation -->
        <animated-circle/>
      </div>
    `
  };
  
  // Render the app
  lips.render('AnimationDemo', app).appendTo('body');
}

function ParticleSystemDemo() {
  // Types for our particle system component
  type ParticleSystemInput = {
    title?: string
    width?: number
    height?: number
    particleCount?: number
    maxParticleSize?: number
    minParticleSize?: number
    speedFactor?: number
    colorScheme?: 'rainbow' | 'fire' | 'ocean' | 'grayscale'
    interactive?: boolean
    showStats?: boolean
    useGravity?: boolean
  }

  type Particle = {
    id: number
    x: number
    y: number
    size: number
    vx: number
    vy: number
    color: string
    alpha: number
    rotation: number
    rotationSpeed: number
    life: number
    maxLife: number
    type: 'circle' | 'rect' | 'polygon' // Pre-calculate shape type
  }

  type ParticleSystemState = {
    particles: Particle[]
    particlePool: Particle[] // Pool of reusable particles
    isRunning: boolean
    mouseX: number
    mouseY: number
    hasMouseInput: boolean
    emissionRate: number
    frameCount: number
    lastFrameTime: number
    fps: number
    statsUpdateCounter: number
    emitterX: number
    emitterY: number
    gravity: number
    wind: number
    turbulence: number
    lastUpdateTime: number // For fixed timestep
  }
  type ParticleSystemStatic = {
    animationFrame: number
  }

  // Cached color maps to avoid string generation during animation
  const colorCache = {
    rainbow: [] as string[],
    fire: [] as string[],
    ocean: [] as string[],
    grayscale: [] as string[]
  };

  // Generate color caches
  for (let i = 0; i < 360; i++) {
    colorCache.rainbow.push(`hsl(${i}, 80%, 60%)`);
  }
  for (let i = 0; i < 60; i++) {
    colorCache.fire.push(`hsl(${i + 10}, 90%, 60%)`);
  }
  for (let i = 0; i < 60; i++) {
    colorCache.ocean.push(`hsl(${i + 180}, 85%, 55%)`);
  }
  for (let i = 0; i < 200; i++) {
    const value = i + 55;
    colorCache.grayscale.push(`rgb(${value}, ${value}, ${value})`);
  }

  // Default input values
  const DEFAULT_INPUT: ParticleSystemInput = {
    title: "Interactive Particle System",
    width: 800,
    height: 500,
    particleCount: 200,
    maxParticleSize: 15,
    minParticleSize: 2,
    speedFactor: 1,
    colorScheme: 'rainbow',
    interactive: true,
    showStats: true,
    useGravity: true
  }

  // Create the particle system component template
  const particleSystem: Template<Metavars<ParticleSystemInput, ParticleSystemState, ParticleSystemStatic>> = {
    _static: {
      animationFrame: 0
    },
    state: {
      particles: [],
      particlePool: [], // Reusable particle pool
      isRunning: false,
      mouseX: 0,
      mouseY: 0,
      hasMouseInput: false,
      emissionRate: 3,
      frameCount: 0,
      lastFrameTime: 0,
      lastUpdateTime: 0,
      fps: 0,
      statsUpdateCounter: 0,
      emitterX: 0,
      emitterY: 0,
      gravity: 0.1,
      wind: 0,
      turbulence: 0.05
    },
    handler: {
      // Initialize the component
      onCreate() {
        // Set default values for undefined inputs
        if (!this.input.width) this.input.width = DEFAULT_INPUT.width
        if (!this.input.height) this.input.height = DEFAULT_INPUT.height
        if (!this.input.title) this.input.title = DEFAULT_INPUT.title
        if (!this.input.particleCount) this.input.particleCount = DEFAULT_INPUT.particleCount
        if (!this.input.maxParticleSize) this.input.maxParticleSize = DEFAULT_INPUT.maxParticleSize
        if (!this.input.minParticleSize) this.input.minParticleSize = DEFAULT_INPUT.minParticleSize
        if (!this.input.speedFactor) this.input.speedFactor = DEFAULT_INPUT.speedFactor
        if (!this.input.colorScheme) this.input.colorScheme = DEFAULT_INPUT.colorScheme
        if (this.input.interactive === undefined) this.input.interactive = DEFAULT_INPUT.interactive
        if (this.input.showStats === undefined) this.input.showStats = DEFAULT_INPUT.showStats
        if (this.input.useGravity === undefined) this.input.useGravity = DEFAULT_INPUT.useGravity
        
        // Initialize emitter at center
        if (this.input.width && this.input.height) {
          this.state.emitterX = this.input.width / 2
          this.state.emitterY = this.input.height / 2
        }
        
        // Initialize particle pool
        this.initializeParticlePool(this.input.particleCount || 200);
      },
      
      // Initialize a pool of reusable particles
      initializeParticlePool(size: number) {
        // Pre-allocate particles to avoid garbage collection during animation
        for (let i = 0; i < size; i++) {
          this.state.particlePool.push(this.createInactiveParticle());
        }
      },
      
      // Create an inactive particle for the pool
      createInactiveParticle(): Particle {
        const minSize = this.input.minParticleSize || 2;
        const maxSize = this.input.maxParticleSize || 15;
        const size = minSize + Math.random() * (maxSize - minSize);
        
        // Determine shape type based on size for faster rendering decisions
        let type: 'circle' | 'rect' | 'polygon';
        if (size < 5) {
          type = 'circle';
        } else if (size < 10) {
          type = 'rect';
        } else {
          type = 'polygon';
        }
        
        return {
          id: Math.random() * 100000 | 0,
          x: 0,
          y: 0,
          size,
          vx: 0,
          vy: 0,
          color: '',
          alpha: 0,
          rotation: 0,
          rotationSpeed: 0,
          life: Number.MAX_SAFE_INTEGER, // Inactive particles have "infinite" life
          maxLife: 0,
          type
        };
      },
      
      // When component mounts, start the animation
      onMount() {
        // Add event listeners if interactive
        if (this.input.interactive) {
          const container = document.querySelector('.particle-system-container');
          if (container) {
            // Use bound event handlers for better performance
            this.boundMouseMove = this.handleMouseMove.bind(this);
            this.boundMouseLeave = this.handleMouseLeave.bind(this);
            container.addEventListener('mousemove', this.boundMouseMove);
            container.addEventListener('mouseleave', this.boundMouseLeave);
          }
        }
      },
      
      // Cleanup when component is destroyed
      onDestroy() {
        this.stopAnimation();
        
        // Remove event listeners
        if (this.input.interactive) {
          const container = document.querySelector('.particle-system-container');
          if (container) {
            container.removeEventListener('mousemove', this.boundMouseMove);
            container.removeEventListener('mouseleave', this.boundMouseLeave);
          }
        }
        
        // Clear particle arrays to help garbage collection
        this.state.particles = [];
        this.state.particlePool = [];
      },
      
      // Handle mouse movement for interactive mode
      handleMouseMove(event: MouseEvent) {
        const container = event.currentTarget as HTMLElement;
        const rect = container.getBoundingClientRect();
        
        this.state.mouseX = event.clientX - rect.left;
        this.state.mouseY = event.clientY - rect.top;
        this.state.hasMouseInput = true;
        
        // Update emitter position to follow mouse
        this.state.emitterX = this.state.mouseX;
        this.state.emitterY = this.state.mouseY;
      },
      
      // Handle mouse leaving the container
      handleMouseLeave() {
        this.state.hasMouseInput = false;
        
        // Reset emitter to center when mouse leaves
        if (this.input.width && this.input.height) {
          this.state.emitterX = this.input.width / 2;
          this.state.emitterY = this.input.height / 2;
        }
      },
      
      // Get a random color from the pre-generated cache
      getRandomColor() {
        const scheme = this.input.colorScheme || 'rainbow';
        const cache = colorCache[scheme];
        
        if (!cache || cache.length === 0) {
          // Fallback if cache is not available
          if (scheme === 'rainbow') {
            const hue = Math.random() * 360;
            return `hsl(${hue}, 80%, 60%)`;
          } else if (scheme === 'fire') {
            const hue = Math.random() * 60 + 10;
            const saturation = 80 + Math.random() * 20;
            const lightness = 50 + Math.random() * 20;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
          } else if (scheme === 'ocean') {
            const hue = Math.random() * 60 + 180;
            const saturation = 70 + Math.random() * 30;
            const lightness = 40 + Math.random() * 30;
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
          } else if (scheme === 'grayscale') {
            const value = Math.floor(Math.random() * 200 + 55);
            return `rgb(${value}, ${value}, ${value})`;
          }
          
          // Default fallback
          return `hsl(${Math.random() * 360}, 80%, 60%)`;
        }
        
        // Use cached colors for better performance
        return cache[Math.floor(Math.random() * cache.length)];
      },
      
      // Activate a particle from the pool
      activateParticle() {
        // Try to find an inactive particle in the pool
        let particle: Particle | undefined;
        
        // Find a particle in the pool with life > maxLife (inactive)
        for (let i = 0; i < this.state.particlePool.length; i++) {
          if (this.state.particlePool[i].life > this.state.particlePool[i].maxLife) {
            particle = this.state.particlePool[i];
            break;
          }
        }
        
        // If no inactive particle found, create a new one
        if (!particle) {
          particle = this.createInactiveParticle();
          if( !particle ) return null

          this.state.particlePool.push(particle);
        }
        
        // Initialize the particle properties
        if (!particle || !this.input.width || !this.input.height) return null;
        
        // Position at emitter
        particle.x = this.state.emitterX;
        particle.y = this.state.emitterY;
        
        // Random velocity with speed factor
        const speedFactor = this.input.speedFactor || 1;
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.5 + Math.random() * 2) * speedFactor;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        
        // Random rotation
        particle.rotation = Math.random() * Math.PI * 2;
        particle.rotationSpeed = (Math.random() - 0.5) * 0.1;
        
        // Lifetime and opacity
        particle.maxLife = 50 + Math.random() * 100;
        particle.life = 0;
        particle.alpha = 0.7 + Math.random() * 0.3;
        
        // Color
        particle.color = this.getRandomColor();
        
        return particle;
      },
      
      // Update particle positions and properties using a fixed timestep for stability
      updateParticles() {
        if (!this.input.width || !this.input.height) return;
        
        const now = performance.now();
        const elapsed = (now - this.state.lastUpdateTime) / 1000; // time in seconds
        this.state.lastUpdateTime = now;
        
        // Use a fixed timestep for physics calculations
        const timeStep = 1/60; // Target 60fps
        
        // Precompute physics values for this frame
        const gravity = this.input.useGravity ? this.state.gravity : 0;
        const wind = this.state.wind;
        const turbulence = this.state.turbulence;
        
        // Prepare batch processing
        const activeParticles: Particle[] = [];
        const particlesToActivate = Math.min(
          this.state.emissionRate,
          (this.input.particleCount || 200) - this.state.particles.length
        );
        
        // Activate new particles
        for (let i = 0; i < particlesToActivate; i++) {
          const particle = this.activateParticle();
          if (particle) {
            this.state.particles.push(particle);
          }
        }
        
        // Update existing particles in a single pass
        for (let i = 0; i < this.state.particles.length; i++) {
          const particle = this.state.particles[i];
          
          // Skip particles that are already dead
          if (particle.life >= particle.maxLife) continue;
          
          // Scale the changes by elapsed time for frame-rate independent physics
          const scaledTimeStep = Math.min(elapsed, 0.1); // Cap to avoid huge jumps
          
          // Update position with scaled velocity
          particle.x += particle.vx * scaledTimeStep * 60; // Scale back to 60fps equivalent
          particle.y += particle.vy * scaledTimeStep * 60;
          
          // Apply forces with scaled time
          particle.vy += gravity * scaledTimeStep * 60;
          particle.vx += wind * scaledTimeStep * 60;
          
          // Apply turbulence (use scaled random values)
          particle.vx += (Math.random() - 0.5) * turbulence * scaledTimeStep * 60;
          particle.vy += (Math.random() - 0.5) * turbulence * scaledTimeStep * 60;
          
          // Update rotation
          particle.rotation += particle.rotationSpeed * scaledTimeStep * 60;
          
          // Update life
          particle.life += scaledTimeStep * 60;
          
          // Calculate alpha based on life percentage
          const lifePercentage = particle.life / particle.maxLife;
          particle.alpha = 1 - Math.pow(lifePercentage, 2);
          
          // Boundary checks with screen edges
          const halfSize = particle.size / 2;
          
          // Bounce off walls with energy loss
          if (particle.x - halfSize < 0) {
            particle.x = halfSize;
            particle.vx = -particle.vx * 0.5;
          } else if (particle.x + halfSize > this.input.width) {
            particle.x = this.input.width - halfSize;
            particle.vx = -particle.vx * 0.5;
          }
          
          // Ground collision with bounce
          if (particle.y + halfSize > this.input.height) {
            particle.y = this.input.height - halfSize;
            
            // Only bounce if velocity is significant
            if (Math.abs(particle.vy) > 0.5) {
              particle.vy = -particle.vy * 0.4; // Bounce with energy loss
            } else {
              particle.vy = 0; // Stop if too slow
              // Add friction to horizontal movement
              particle.vx *= 0.95;
            }
          }
          
          // Keep active particles
          if (particle.life < particle.maxLife) {
            activeParticles.push(particle);
          }
        }
        
        // Bulk update state with the filtered particles
        if (this.state.particles.length !== activeParticles.length) {
          this.state.particles = activeParticles;
        }
      },
      
      // Cached particle points for polygon shapes to avoid recalculation
      getParticlePoints(particle) {
        // Large particles are stars or polygons
        const points: string[] = [];
        const spikes = 5;
        const outerRadius = particle.size / 2;
        const innerRadius = particle.size / 4;
        
        for (let i = 0; i < spikes * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (Math.PI / spikes) * i;
          const x = particle.x + radius * Math.sin(angle);
          const y = particle.y + radius * Math.cos(angle);
          points.push(`${x},${y}`);
        }
        
        return points.join(' ');
      },
      
      // Start the animation loop with performance optimizations
      startAnimation() {
        if (this.state.isRunning) return;
        
        this.state.isRunning = true;
        this.state.lastFrameTime = performance.now();
        this.state.lastUpdateTime = performance.now();
        
        // Pre-bind the animate function to avoid creating a new function on each frame
        if (!this.boundAnimate) {
          this.boundAnimate = this.animate.bind(this);
        }
        
        this.static.animationFrame = requestAnimationFrame(this.boundAnimate);
      },
      
      // Optimized animation loop
      animate() {
        if (!this.state.isRunning) return;
        
        // Calculate FPS
        const now = performance.now();
        const delta = now - this.state.lastFrameTime;
        this.state.lastFrameTime = now;
        
        // Update FPS counter every 10 frames
        this.state.statsUpdateCounter++;
        if (this.state.statsUpdateCounter >= 10) {
          this.state.fps = Math.round(1000 / delta);
          this.state.statsUpdateCounter = 0;
        }
        
        // Update particles
        this.updateParticles();
        
        // Update frame counter
        this.state.frameCount++;
        
        // Vary wind and turbulence over time for natural movement
        // Use pre-calculated sine values for better performance
        const frameIndex = this.state.frameCount % 628; // 2π × 100
        const sinValue1 = Math.sin(frameIndex * 0.01);
        const sinValue2 = Math.sin(frameIndex * 0.005);
        
        this.state.wind = sinValue1 * 0.05;
        this.state.turbulence = 0.03 + sinValue2 * 0.02;
        
        // Schedule the next frame
        this.static.animationFrame = requestAnimationFrame(this.boundAnimate);
      },
      
      // Stop the animation loop
      stopAnimation() {
        this.state.isRunning = false;
        cancelAnimationFrame(this.static.animationFrame);
      },
      
      // Toggle the animation
      toggleAnimation() {
        if (this.state.isRunning) {
          this.stopAnimation();
        } else {
          this.startAnimation();
        }
      },
      
      // Change color scheme
      changeColorScheme(scheme: 'rainbow' | 'fire' | 'ocean' | 'grayscale') {
        this.input.colorScheme = scheme;
      },
      
      // Increase particle count
      increaseParticleCount() {
        if (this.input.particleCount) {
          const newCount = Math.min(1000, this.input.particleCount + 50);
          
          // Ensure we have enough particles in the pool
          if (newCount > this.state.particlePool.length) {
            const additionalNeeded = newCount - this.state.particlePool.length;
            for (let i = 0; i < additionalNeeded; i++) {
              this.state.particlePool.push(this.createInactiveParticle());
            }
          }
          
          this.input.particleCount = newCount;
        }
      },
      
      // Decrease particle count
      decreaseParticleCount() {
        if (this.input.particleCount) {
          this.input.particleCount = Math.max(50, this.input.particleCount - 50);
          
          // If we have more active particles than allowed, deactivate some
          if (this.state.particles.length > this.input.particleCount) {
            this.state.particles.length = this.input.particleCount;
          }
        }
      },
      
      // Toggle gravity
      toggleGravity() {
        this.input.useGravity = !this.input.useGravity;
        if (!this.input.useGravity) {
          // Reset all particle vertical velocities when turning off gravity
          // Use direct array iteration for better performance
          for (let i = 0; i < this.state.particles.length; i++) {
            this.state.particles[i].vy *= 0.5;
          }
        }
      },
      
      // Increase emission rate
      increaseEmissionRate() {
        this.state.emissionRate = Math.min(20, this.state.emissionRate + 1);
      },
      
      // Decrease emission rate
      decreaseEmissionRate() {
        this.state.emissionRate = Math.max(1, this.state.emissionRate - 1);
      }
    },
    
    // Optimize the template to reduce dynamic property evaluations
    default: `
      <div class="particle-system-container" style="width: {Number(input.width) + 40}px; height: {Number(input.height) + 280}px">
        <h2 class="particle-system-title">{input.title}</h2>
        
        <svg class="particle-system-svg" 
            width=input.width 
            height=input.height
            viewBox="0 0 {input.width} {input.height}">
          
          <!-- Background gradient -->
          <defs>
            <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#111122;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#222244;stop-opacity:1" />
            </linearGradient>
          </defs>
          
          <!-- Background -->
          <rect width=input.width height=input.height fill="url(#bg-gradient)" />
          
          <!-- Emitter -->
          <if(state.hasMouseInput || input.interactive)>
            <circle
              cx=state.emitterX
              cy=state.emitterY
              r="10"
              fill="rgba(255, 255, 255, 0.5)"
              stroke="white"
              stroke-width="2"
            />
          </if>
          
          <!-- Particles - Using pre-computed particle type for faster rendering decisions -->
          <if( state.particles.length )>
            <for [particle] in=state.particles>
              <if( particle.type === 'circle' )>
                <circle
                  cx=particle.x
                  cy=particle.y
                  r=(particle.size/2)
                  fill=particle.color
                  opacity=particle.alpha.toFixed(2)
                  transform="rotate({particle.rotation * 180 / Math.PI}, {particle.x}, {particle.y})"/>
              </if>
              <else-if( particle.type === 'rect' )>
                <rect 
                  x=(particle.x - particle.size/2)
                  y=(particle.y - particle.size/2)
                  width=particle.size
                  height=particle.size
                  fill=particle.color
                  opacity=particle.alpha.toFixed(2)
                  transform="rotate({particle.rotation * 180 / Math.PI}, {particle.x}, {particle.y})"/>
              </else-if>
              <else>
                <polygon
                  points=self.getParticlePoints(particle)
                  fill=particle.color
                  opacity=particle.alpha.toFixed(2)
                  transform="rotate({particle.rotation * 180 / Math.PI}, {particle.x}, {particle.y})"/>
              </else>
            </for>
          </if>
        </svg>
        
        <div class="particle-system-controls">
          <button class="particle-system-button {state.isRunning ? 'stop' : ''}" 
                  on-click(toggleAnimation)>
            {state.isRunning ? 'Pause' : 'Start'} Animation
          </button>
          
          <button class="particle-system-button" on-click(increaseParticleCount)>
            More Particles
          </button>
          
          <button class="particle-system-button" on-click(decreaseParticleCount)>
            Less Particles
          </button>
          
          <button class="particle-system-button" on-click(toggleGravity)>
            {input.useGravity ? 'Disable' : 'Enable'} Gravity
          </button>
          
          <button class="particle-system-button" on-click(increaseEmissionRate)>
            Faster Emission
          </button>
          
          <button class="particle-system-button" on-click(decreaseEmissionRate)>
            Slower Emission
          </button>
          
          <div class="particle-system-color-controls">
            <span>Color: </span>
            <button class="color-button rainbow" on-click(changeColorScheme, 'rainbow')></button>
            <button class="color-button fire" on-click(changeColorScheme, 'fire')></button>
            <button class="color-button ocean" on-click(changeColorScheme, 'ocean')></button>
            <button class="color-button grayscale" on-click(changeColorScheme, 'grayscale')></button>
          </div>
        </div>
        
        <if(input.showStats)>
          <div class="particle-system-stats">
            <div class="stat-item">Status: <b>{state.isRunning ? 'Running' : 'Paused'}</b></div>
            <div class="stat-item">FPS: <b>{state.fps}</b></div>
            <div class="stat-item">Particles: <b>{state.particles.length} / {input.particleCount}</b></div>
            <div class="stat-item">Emission Rate: <b>{state.emissionRate}/frame</b></div>
            <div class="stat-item">Color Scheme: <b>{input.colorScheme}</b></div>
            <div class="stat-item">Gravity: <b>{input.useGravity ? 'On' : 'Off'}</b></div>
          </div>
        </if>
      </div>
    `,

    // CSS styles for the particle system remain the same
    stylesheet: `
      .particle-system-container {
        font-family: Arial, sans-serif;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        margin: 20px auto;
        background-color: #1a1a2e;
        color: white;
        overflow: hidden;
      }
      
      .particle-system-title {
        font-size: 20px;
        margin-bottom: 15px;
        color: #eee;
        text-align: center;
      }
      
      .particle-system-svg {
        display: block;
        border-radius: 4px;
        margin-bottom: 15px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      }
      
      .particle-system-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 15px;
        justify-content: center;
      }
      
      .particle-system-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        background-color: #4a5bf7;
        color: white;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
      }
      
      .particle-system-button:hover {
        background-color: #6979ff;
        transform: translateY(-2px);
      }
      
      .particle-system-button:active {
        transform: translateY(0);
      }
      
      .particle-system-button.stop {
        background-color: #f75a5a;
      }
      
      .particle-system-button.stop:hover {
        background-color: #ff7979;
      }
      
      .particle-system-stats {
        background-color: rgba(0, 0, 0, 0.2);
        padding: 15px;
        border-radius: 4px;
        font-size: 14px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      
      .stat-item {
        margin-bottom: 5px;
        color: white;
      }
      
      .particle-system-color-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .color-button {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        transition: transform 0.2s;
      }
      
      .color-button:hover {
        transform: scale(1.2);
      }
      
      .color-button.rainbow {
        background: linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet);
      }
      
      .color-button.fire {
        background: linear-gradient(to bottom, yellow, orange, red);
      }
      
      .color-button.ocean {
        background: linear-gradient(to bottom, #00e1ff, #0077ff, #0033cc);
      }
      
      .color-button.grayscale {
        background: linear-gradient(to bottom, white, gray, black);
      }
    `
  }

  const lips = new Lips({ debug: false })
  
  // Register the particle system component
  lips.register('particle-system', particleSystem)
  
  // Create a demo app that uses multiple particle systems
  const demoApp: Template<Metavars<{}, {}>> = {
    default: `
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px; background-color: #121212;">
        <h1 style="color: white; text-align: center;">Particle System Performance Test</h1>
        <p style="color: #ccc; text-align: center;">This demo creates multiple particle systems with different configurations to test Lips performance.</p>
        
        <div style="display: flex; flex-direction: column; gap: 30px;">
          <!-- High-performance particle system -->
          <particle-system 
            title="High-Performance System (500 particles)" 
            width="600" 
            height="400"
            particleCount="500"
            maxParticleSize="12"
            minParticleSize="2"
            speedFactor="1.2"
            colorScheme="rainbow"
            interactive="true"
            showStats="true"
            useGravity="true"/>
            
          <!-- Medium-performance systems side by side -->
          <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
            <particle-system
              title="Fire Effect"
              width="400"
              height="300"
              particleCount="200" 
              speedFactor="0.8"
              colorScheme="fire"
              interactive="true"
              showStats="true"
              useGravity="true"/>
              
            <particle-system
              title="Ocean Effect"
              width="400"
              height="300"
              particleCount="200" 
              speedFactor="0.8"
              colorScheme="ocean"
              interactive="true"
              showStats="true"
              useGravity="false"/>
          </div>
          
          <!-- Small particle system for comparison -->
          <particle-system
            title="Low-Performance System (50 particles)"
            width="300"
            height="200"
            particleCount="50" 
            speedFactor="0.5"
            colorScheme="grayscale"
            interactive="true"
            showStats="true"
            useGravity="true"/>
        </div>
      </div>
    `
  }
  
  // Render the demo app
  lips.render('ParticleSystemDemo', demoApp).appendTo('body')
}

// WaveGraphDemo()
// AnimationDemo()
// ParticleSystemDemo()

/**
 * ------------------------------------------------------------------------- 
 */