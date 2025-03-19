import { 
  META_ATTRIBUTES,
  FUNCTION_ATTR_FLAG,
  EVENT_LISTENER_FLAG
} from './utils'

function matchEventHandlers( input: string ): string {
  const pattern = /on-([a-zA-Z-]+)\s*\(/g
  let 
  result = input,
  match
  
  while ( ( match = pattern.exec( input ) ) !== null ) {
    const event = match[1]
    const startIndex = match.index + match[0].length
    let 
      parenthesesCount = 1,
      position = startIndex
    
    while ( position < input.length && parenthesesCount > 0 ) {
      if ( input[position] === '(' ) parenthesesCount++
      if ( input[position] === ')' ) parenthesesCount--
      position++
    }
    
    if ( parenthesesCount === 0 ) {
      const 
      expression = input.slice( startIndex, position - 1 ).trim(),
      prefix = input.slice( 0, match.index ),
      replacement = `${EVENT_LISTENER_FLAG}${event}="${expression}"`,
      suffix = input.slice( position )
      
      result = prefix + replacement + suffix
      input = result  // Update input for next iteration
      pattern.lastIndex = prefix.length + replacement.length
    }
  }
  
  return result
}
function markExpressionAttributes( html: string ): string {
  // Use a temporary placeholder to preserve content inside tags
  const 
  tagContents: string[] = [],
  preservedHtml = html.replace(/<([a-zA-Z][a-zA-Z0-9_-]*)((?:[^>'"]*|'[^']*'|"[^"]*")*?)(?:\/?>)/g, ( match, tagName, attrs ) => {
    // Each tag attributes for processing
    tagContents.push( attrs )

    return `<${tagName}##TAG_ATTRS_${tagContents.length - 1}##>`
  })

  // Process each tag's attributes
  let result = preservedHtml
  for( let i = 0; i < tagContents.length; i++ ){
    const
    placeholder = `##TAG_ATTRS_${i}##`,
    attrs = tagContents[ i ],
    
    // Process attributes without breaking special syntax
    processedAttrs = processAttributes( attrs )
    // Replace placeholder with processed attributes
    result = result.replace( placeholder, processedAttrs )
  }

  return result
}
function processAttributes( attrs: string ): string {
  // Handle quoted attributes carefully
  let 
  processedAttrs = '',
  pos = 0,
  inQuotes = false,
  quoteChar = '',
  attrStart = 0,
  inParens = 0,
  inBraces = 0

  // First pass: identify attribute boundaries
  while( pos < attrs.length ){
    const char = attrs[ pos ]
    
    // Track quotes
    if( ( char === '"' || char === "'" ) && ( pos === 0 || attrs[ pos-1 ] !== '\\' ) ){
      if( !inQuotes ){
        inQuotes = true
        quoteChar = char
      }
      else if ( char === quoteChar ) inQuotes = false
    }
    
    // Track parentheses and braces
    if( !inQuotes ){
      if( char === '(' ) inParens++
      else if( char === ')' ) inParens--
      else if( char === '{' ) inBraces++
      else if( char === '}' ) inBraces--
    }
    
    // Attribute boundary found
    if( !inQuotes 
        && inParens === 0 
        && inBraces === 0 
        && ( char === ' ' || pos === attrs.length - 1 ) ){
      // Extract the attribute
      let attrEnd = pos
      if( pos === attrs.length - 1 )
        attrEnd = pos + 1
      
      const attr = attrs.substring( attrStart, attrEnd ).trim()
      if( attr ){
        const processedAttr = processAttribute( attr )
        processedAttrs += ' '+ processedAttr
      }
      
      attrStart = pos + 1
    }
    
    pos++
  }

  return processedAttrs
}
function processAttribute( attr: string ): string {
  // Extract attribute name and value
  const equalPos = attr.indexOf('=')

  // Handle boolean attributes (no equal sign)
  if( equalPos === -1 ){
    /**
     * Ignore parsing the following special attributes
     * for they're handled in runtime.
     * 
     * - Spread operators
     * - Mesh arguments
     */
    if( attr.startsWith('...') || attr.startsWith('[') ) 
      return attr
    
    /**
     * Process no explicit value attributes
     * 
     * Eg. `checked`, `!disabled`
     */
    return `:${attr}="${!attr.startsWith('!')}"`
  }
  
  const name = attr.substring( 0, equalPos ).trim()
  let value = attr.substring( equalPos + 1 ).trim()
  
  if( name.startsWith('@') && !META_ATTRIBUTES.includes( name ) ) 
    return `:${name.slice(1)}=${value}`
  
  /**
   * Ignore parsing the following special attributes
   * for they're handled in runtime.
   * 
   * - Method functions
   * - Event handlers
   */
  if( name.startsWith( FUNCTION_ATTR_FLAG ) 
      || name.startsWith( EVENT_LISTENER_FLAG ) )
    return attr
  
  // Check for quoted values
  if( ( value.startsWith('"') && value.endsWith('"') ) 
      || ( value.startsWith("'") && value.endsWith("'") ) ){
    // Extract value without quotes
    const innerValue = value.substring( 1, value.length - 1 )
    
    // Check if it's an expression inside quotes
    if( isExpression( innerValue ) )
      return `:${name}="${innerValue}"`
    
    // Keep literal strings as it is
    return attr
  }
  // Unquoted values are likely expressions
  else return `:${name}="${value}"`
}

export function isExpression( value: string ): boolean {
  // Meta variables
  if( /\bstate\.|\binput\.|\bself\.|\bcontext\./.test( value ) )
    return true
  
  // JavaScript expressions
  if( /[\+\*\/\%\(\)\{\}\[\]]|\?\s*:/.test( value ) )
    return true
  
  // Dot notation access
  if( /\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_]/.test( value ) )
    return true
  
  // Syntax highlighting delimiters: often used in style attributes
  if( value.includes('{') && value.includes('}') )
    return true
  
  return false
}

export function preprocessor( str: string ): string {
  let result = (str || '')
                // Clean up & standard preprocessing
                .trim()
                .replace(/>\s*</g, '><')
                .replace(/\s{2,}/g, ' ')
                .replace(/[\r\n\t]/g, '')
                // Apply Lips-specific transformations after marking expressions
                .replace(/<([a-zA-Z0-9_-]+)([^>]*?)\s*\/>/g, '<$1$2></$1>')
                .replace(/<\{([^}]+)\}\s*(.*?)\/>/g, '<lips dtag="$1" $2></lips>')
                .replace(/(<>)([\s\S]*?)(<\/>)/g, '<lips fragment="true">$2</lips>')
                .replace(/<if\(\s*(.*?)\s*\)>/g, '<if @by="$1">')
                .replace(/<else-if\(\s*(.*?)\s*\)>/g, '<else-if @by="$1">')
                .replace(/<switch\(\s*(.*?)\s*\)>/g, '<switch @by="$1">')
                .replace(/<async await\(\s*(.*?)\s*\)>/g, `<async ${FUNCTION_ATTR_FLAG}await="$1">`)
                .replace(/<log\(\s*(.*?)\s*\)>/g, '<log @args="$1">')
                .replace(/\[(.*?)\]/g, match => match.replace(/\s+/g, '') )

  /**
   * Process event handlers
   */
  result = matchEventHandlers( result )
  /**
   * Handle expression attributes with a more 
   * careful approach
   */
  result = markExpressionAttributes( result )

  return result
}