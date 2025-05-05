
export const ROOT_PATH = '#0'
export const I18N_ATTR_FLAG = 'i18n'
export const SYNCTAX_VAR_FLAG = 'syn:'
export const FUNCTION_ATTR_FLAG = 'fn:'
export const EVENT_LISTENER_FLAG = 'on-'
export const SPREAD_VAR_PATTERN = /^\.\.\./
export const ARGUMENT_VAR_PATTERN = /^\[(.*?)\]$/
export const INTERPOLATE_PATTERN = /{\s*([^{}]+)\s*}/g
export const META_ATTRIBUTES = ['@html', '@text', '@format']
export const NATIVE_SYNTAX_TAGS = ['if', 'for', 'switch', 'async', 'router']
export const LAYOUT_AFFECTING_ATTRS = [ 'display', 'visibility', 'position', 'width', 'height' ]

export const NODE_PREFIX = ':n'
export const PARTIAL_ROOT_PREFIX = ':pr'
export const MACRO_PREFIX = 'm'
export const COMPONENT_PREFIX = 'c'
export const SYNTAX_COMPONENT_PREFIX = 'x'
export const DEFAULT_PARTIAL_PATH_SLOT = '*'
export const GENERIC_TAGNAME_ATTR = ':xtag'
export const DYNAMIC_TAGNAME_ATTR = ':dtag'

/**
 * Constant for max update type priorities
 */
export const MAX_PRIORITY_TYPES = 100
