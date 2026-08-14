const TAP_HANDLER_MARKER = '__systemHapticTapHandler__'
const HAPTIC_TAP_METHOD = '__hapticTap'
const DEDUPE_INTERVAL = 80

type PageHandler = (this: unknown, ...args: unknown[]) => unknown
type MarkedHandler = PageHandler & {
  [TAP_HANDLER_MARKER]?: true
}
type HapticType = 'light' | 'medium' | 'heavy'

let lastVibrateAt = 0

function isTapEvent(event: unknown): boolean {
  return typeof event === 'object'
    && event !== null
    && 'type' in event
    && event.type === 'tap'
}

export function vibrate(type: HapticType): void {
  const now = Date.now()
  if (now - lastVibrateAt < DEDUPE_INTERVAL) return

  try {
    if (typeof wx === 'undefined' || typeof wx.vibrateShort !== 'function') return
    lastVibrateAt = now
    wx.vibrateShort({
      type,
      fail: () => {},
    })
  } catch {}
}

export function light(): void {
  vibrate('light')
}

export function medium(): void {
  vibrate('medium')
}

export function heavy(): void {
  vibrate('heavy')
}

function wrapTapAwareHandler(handler: PageHandler): PageHandler {
  const markedHandler = handler as MarkedHandler
  if (markedHandler[TAP_HANDLER_MARKER]) return handler

  const wrappedHandler: MarkedHandler = function (...args: unknown[]) {
    if (isTapEvent(args[0])) light()
    return handler.apply(this, args)
  }
  wrappedHandler[TAP_HANDLER_MARKER] = true
  return wrappedHandler
}

export function enhancePageOptions<T>(pageOptions: T): T {
  if (typeof pageOptions !== 'object' || pageOptions === null) return pageOptions

  const options = pageOptions as Record<string, unknown>
  Object.keys(options).forEach((name) => {
    if (name === HAPTIC_TAP_METHOD) return
    const handler = options[name]
    if (typeof handler === 'function') {
      options[name] = wrapTapAwareHandler(handler as PageHandler)
    }
  })

  if (typeof options[HAPTIC_TAP_METHOD] !== 'function') {
    options[HAPTIC_TAP_METHOD] = (event: unknown) => {
      if (isTapEvent(event)) light()
    }
  }

  return pageOptions
}
