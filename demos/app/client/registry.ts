
import type Lips from '../../../../dist/lips.min'

import * as Counter from '../components/counter'
import * as Profile from '../components/profile'
import * as Footer from '../components/footer'

export default ( lips: Lips ) => {
  lips.register('counter', Counter )
  lips.register('profile', Profile )
  lips.register('footer', Footer )
}