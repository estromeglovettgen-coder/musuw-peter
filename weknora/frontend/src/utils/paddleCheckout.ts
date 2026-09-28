import {
  CheckoutEventNames,
  initializePaddle,
  type Paddle,
  type PaddleEventData,
} from '@paddle/paddle-js'

let paddlePromise: Promise<Paddle | undefined> | null = null
let activeEnvironment: PaddleCheckoutInput['environment'] | undefined
let activeClientToken: string | undefined
let activePwCustomerId: string | undefined
let completed: (() => void) | undefined
let activeEventCallback: ((event: PaddleEventData) => void) | undefined

interface PaddleCheckoutInput {
  environment: 'sandbox' | 'live'
  clientToken: string
  transactionId: string
  pwCustomerId?: string
  email?: string
  locale?: string
  onCompleted: () => void
}

export interface PreviewPaddlePricesInput {
  environment: 'sandbox' | 'live'
  clientToken: string
  pwCustomerId?: string
  priceIds: string[]
}

export interface OpenPaddleInlineCheckoutInput extends PaddleCheckoutInput {
  frameTarget: string
  onEvent?: (event: PaddleEventData) => void
}

export interface PaddleLocalizedPrice {
  priceId: string
  /**
   * Paddle's formatted pre-tax line-item subtotal. Keep this string untouched
   * for the checkout summary while the embedded Checkout is loading.
   */
  formattedSubtotal: string
  /**
   * Paddle's final formatted line-item total, including any tax that applies
   * to the buyer's location. Keep this string untouched so the pricing page
   * matches the amount Paddle shows at checkout.
   */
  formattedTotal: string
  currencyCode: string
}

function toPaddleLocale(value?: string): string | undefined {
  const locale = value?.trim().toLowerCase()
  if (!locale) return undefined
  if (locale === 'zh' || locale.startsWith('zh-')) return 'zh-Hans'
  if (locale === 'ko' || locale.startsWith('ko-')) return 'ko'
  if (locale === 'ru' || locale.startsWith('ru-')) return 'ru'
  return 'en'
}

function retainCustomerID(value?: string): string | undefined {
  const candidate = value?.trim()
  return candidate && /^ctm_[a-z0-9]{26}$/.test(candidate) ? candidate : undefined
}

async function initialize(input: Pick<PaddleCheckoutInput, 'environment' | 'clientToken' | 'pwCustomerId'>) {
  const pwCustomerId = retainCustomerID(input.pwCustomerId)
  if (paddlePromise && (input.environment !== activeEnvironment || input.clientToken !== activeClientToken)) {
    throw new Error('Paddle.js configuration changed; reload required')
  }
  if (!paddlePromise) {
    const eventCallback = (event: PaddleEventData) => {
      activeEventCallback?.(event)
      if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
        const callback = completed
        completed = undefined
        callback?.()
      }
    }
    activeEnvironment = input.environment
    activeClientToken = input.clientToken
    activePwCustomerId = pwCustomerId
    paddlePromise = initializePaddle({
      ...(input.environment === 'sandbox' ? { environment: 'sandbox' as const } : {}),
      token: input.clientToken,
      pwCustomer: pwCustomerId ? { id: pwCustomerId } : {},
      eventCallback,
    }).catch((error) => {
      paddlePromise = null
      activeEnvironment = undefined
      activeClientToken = undefined
      activePwCustomerId = undefined
      throw error
    })
  }
  const paddle = await paddlePromise
  if (paddle && pwCustomerId !== activePwCustomerId) {
    paddle.Update({ pwCustomer: pwCustomerId ? { id: pwCustomerId } : {} })
    activePwCustomerId = pwCustomerId
  }
  return paddle
}

export async function initializePaddlePaymentLink(
  input: Pick<PaddleCheckoutInput, 'environment' | 'clientToken' | 'pwCustomerId'>,
): Promise<void> {
  const paddle = await initialize(input)
  if (!paddle) throw new Error('Paddle.js failed to initialize')
}

export async function previewPaddlePrices(input: PreviewPaddlePricesInput): Promise<PaddleLocalizedPrice[]> {
  const priceIds = [...new Set(input.priceIds.map((value) => value.trim()).filter(Boolean))]
  if (!priceIds.length) return []
  const paddle = await initialize(input)
  if (!paddle) throw new Error('Paddle.js failed to initialize')
  const preview = await paddle.PricePreview({
    items: priceIds.map((priceId) => ({ priceId, quantity: 1 })),
  })
  return preview.data.details.lineItems.map((item) => ({
    priceId: item.price.id,
    formattedSubtotal: item.formattedUnitTotals.subtotal,
    // `subtotal` is pre-tax. With Paddle's `location` tax mode it is lower
    // than the advertised/charged amount in tax-inclusive countries (for
    // example, Japan), so use Paddle's final formatted total instead.
    formattedTotal: item.formattedTotals.total,
    currencyCode: preview.data.currencyCode,
  }))
}

export async function openPaddleInlineCheckout(input: OpenPaddleInlineCheckoutInput): Promise<void> {
  completed = input.onCompleted
  activeEventCallback = input.onEvent
  const paddle = await initialize(input)
  if (!paddle) throw new Error('Paddle.js failed to initialize')
  paddle.Checkout.open({
    transactionId: input.transactionId,
    customer: input.email ? { email: input.email } : undefined,
    settings: {
      displayMode: 'inline',
      variant: 'one-page',
      theme: 'light',
      allowLogout: false,
      locale: toPaddleLocale(input.locale),
      frameTarget: input.frameTarget,
      frameInitialHeight: 640,
      frameStyle: 'width:100%; min-width:312px; background-color:transparent; border:none;',
    },
  })
}

export async function closePaddleCheckout(): Promise<void> {
  completed = undefined
  activeEventCallback = undefined
  const paddle = await paddlePromise
  paddle?.Checkout.close()
}
