import type { I18nVariant, I18nFormat } from '..'

function injectParams( text: string, params?: Record<string, any> ){
  if( !params ) return text

  return text.replace(/{(\w+)}/g, ( _, key ) => {
    return params[ key ] !== undefined
                      ? params[ key ].toString()
                      : `{${key}}`
  })
}

export default ( type: string, reference: string, value: I18nFormat['value'], params: Record<string, any>, variant?: string ) => {
  
  switch( type ){
      /**
       * Plural forms translation
       */
      case 'plural': {
        if( typeof value === 'string' ){
          console.warn(`Plural format value cannot be a string`)
          return 
        }

        if( params.count === undefined ){
          console.warn(`Plural format requires <count> parameter or use * by default.`)
          // Fall back to '*'
          let formText = value['*']
          // Default form come with variants
          if( typeof formText === 'object' )
            formText = formText[ variant || '*' ]
          
          return injectParams( formText, params )
        }

        // `count` param must be integer or float
        if( typeof params.count === 'string' )
          params.count = Number( params.count )
        
        let form = '*' // Default is '*' for many/other

        /**
         * When `count` matches an exact form key
         */
        if( params.count.toString() in value )
          form = params.count.toString()

        let formText = value[ form ] || value['*']
        /**
         * In case form text is also has variants
         */
        if( typeof formText === 'object' )
          formText = formText[ variant || '*' ]
        
        return injectParams( formText, params )
      }

      /**
       * Conditional variable format translation
       */
      case 'condition': {
        if( typeof value === 'string' ){
          console.warn(`Condition format value cannot be a string`)
          return 
        }

        let text

        // Evaluate each condition
        for( const expr in value )
          try {
            const fn = new Function('params', `with( params ){ return ${expr}; }`)
            if( fn( params || {} ) ){
              text = value[ expr ]
              break
            }
          }
          catch( error ){ console.warn(`Invalid <${reference}(${expr})> condition expression`) }

        if( text === undefined ) return

        /**
         * In case form text is also has variants
         */
        if( typeof text === 'object' )
          text = text[ variant || '*' ]
        
        return injectParams( text, params )
      }

      /**
       * Simple variable format translation
       */
      case 'variable':
      default: {
        const text = typeof value === 'object' 
                          ? value[ variant || '*' ] // Select variant
                          : value

        if( typeof text === 'object' ){
          console.warn(`Invalid <${reference}> variable variant definition`)
          return
        }
      
        return injectParams( text, params )
      }
    }
}