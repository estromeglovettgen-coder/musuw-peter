<template>
  <div class="payment-link-page">
    <header class="payment-link-page__topbar">
      <a class="payment-link-page__brand" href="https://musuw.com/" :aria-label="$t('entitlement.backToProduct')">
        <img src="/musuw-logo.png" alt="" />
      </a>
    </header>

    <main class="payment-link-page__main">
      <section class="payment-link-page__card">
        <h1>{{ $t('entitlement.paymentLinkTitle') }}</h1>
        <p v-if="loading" class="payment-link-page__status">{{ $t('common.loading') }}</p>
        <p v-else-if="errorMessage" class="payment-link-page__status is-error">{{ errorMessage }}</p>
        <p v-else class="payment-link-page__status">{{ $t('entitlement.paymentLinkReady') }}</p>

        <div class="payment-link-page__actions">
          <a href="https://musuw.com/">{{ $t('entitlement.backToProduct') }}</a>
          <a href="https://musuw.com/contact">{{ $t('entitlement.paymentLinkSupport') }}</a>
        </div>

        <nav class="payment-link-page__legal" :aria-label="$t('entitlement.paymentLinkLegal')">
          <a href="https://musuw.com/terms">{{ $t('entitlement.termsOfService') }}</a>
          <a href="https://musuw.com/privacy">{{ $t('entitlement.privacyPolicy') }}</a>
          <a href="https://musuw.com/refund-policy">{{ $t('entitlement.refundPolicy') }}</a>
        </nav>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPaddlePublicConfig } from '@/api/entitlement'
import { initializePaddlePaymentLink } from '@/utils/paddleCheckout'

const { t } = useI18n()
const loading = ref(true)
const errorMessage = ref('')

onMounted(async () => {
  try {
    const config = await getPaddlePublicConfig()
    if (!config.configured || !config.environment || !config.client_token) {
      throw new Error('Paddle.js is not configured')
    }
    await initializePaddlePaymentLink({
      environment: config.environment,
      clientToken: config.client_token,
    })
  } catch {
    errorMessage.value = t('entitlement.paymentLinkError')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="less">
.payment-link-page { min-height: 100dvh; background: #fff; color: #111; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
.payment-link-page__topbar { height: 72px; padding: 0 28px; display: flex; align-items: center; border-bottom: 1px solid #ededed; }
.payment-link-page__brand { width: 44px; height: 44px; display: grid; place-items: center; }
.payment-link-page__brand img { width: 100%; height: 100%; object-fit: contain; }
.payment-link-page__main { width: min(560px,calc(100% - 32px)); margin: 0 auto; padding: 72px 0; }
.payment-link-page__card { padding: 36px; border: 1px solid #dedede; border-radius: 20px; text-align: center; }
.payment-link-page__card h1 { margin: 0; font-size: 28px; line-height: 36px; }
.payment-link-page__status { margin: 16px 0 0; color: #666; line-height: 24px; }
.payment-link-page__status.is-error { color: #b42318; }
.payment-link-page__actions { margin-top: 28px; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.payment-link-page__actions a { min-height: 42px; padding: 0 20px; display: inline-flex; align-items: center; border-radius: 999px; background: #111; color: #fff; font-weight: 650; text-decoration: none; }
.payment-link-page__legal { margin-top: 28px; padding-top: 22px; display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; border-top: 1px solid #ededed; }
.payment-link-page__legal a { color: #555; font-size: 13px; }
@media (max-width: 560px) { .payment-link-page__main { padding-top: 36px; } .payment-link-page__card { padding: 28px 20px; } }
</style>
