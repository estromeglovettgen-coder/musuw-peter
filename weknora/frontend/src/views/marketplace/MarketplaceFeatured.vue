<template>
  <section
    v-if="products.length"
    class="market-featured-carousel"
    :aria-label="t('creatorMarketplace.featured')"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <Swiper
      v-if="multiple"
      :key="products.map(product => product.id).join(',')"
      :modules="[Autoplay]"
      :slides-per-view="1"
      :space-between="16"
      :rewind="true"
      :speed="reducedMotion ? 0 : 350"
      :autoplay="{ delay: 5000, disableOnInteraction: false }"
      class="market-featured-swiper"
      @swiper="onSwiper"
      @slide-change="onSlideChange"
    >
      <SwiperSlide
        v-for="(product, index) in products"
        :key="product.id"
        :inert="index !== activeIndex"
        :aria-hidden="index !== activeIndex"
      >
        <RouterLink class="market-featured market-product-link" :class="{ 'market-featured--text-only': !product.cover_url }" :to="`/platform/marketplace/${encodeURIComponent(product.id)}`" :aria-label="product.title">
          <img v-if="product.cover_url" class="market-cover" :src="product.cover_url" alt="" referrerpolicy="no-referrer" />
          <div class="market-featured-copy">
            <span class="market-badge">{{ t('creatorMarketplace.featured') }}</span>
            <h2>{{ product.title }}</h2>
            <p>{{ product.description }}</p>
            <div class="market-actions">
              <strong class="market-price">{{ price(product) }}<small v-if="!isFreeMarketProduct(product)">{{ t('creatorMarketplace.perMonth') }}</small></strong>
            </div>
          </div>
        </RouterLink>
      </SwiperSlide>
    </Swiper>
    <RouterLink v-else class="market-featured market-product-link" :class="{ 'market-featured--text-only': !products[0].cover_url }" :to="`/platform/marketplace/${encodeURIComponent(products[0].id)}`" :aria-label="products[0].title">
      <img v-if="products[0].cover_url" class="market-cover" :src="products[0].cover_url" alt="" referrerpolicy="no-referrer" />
      <div class="market-featured-copy">
        <span class="market-badge">{{ t('creatorMarketplace.featured') }}</span>
        <h2>{{ products[0].title }}</h2>
        <p>{{ products[0].description }}</p>
        <div class="market-actions">
          <strong class="market-price">{{ price(products[0]) }}<small v-if="!isFreeMarketProduct(products[0])">{{ t('creatorMarketplace.perMonth') }}</small></strong>
        </div>
      </div>
    </RouterLink>
    <div v-if="multiple" class="market-featured-controls">
      <t-button theme="default" variant="text" shape="square" :aria-label="t('creatorMarketplace.prevFeatured')" @click="swiper?.slidePrev()">
        <t-icon name="chevron-left" />
      </t-button>
      <div class="market-featured-dots">
        <button
          v-for="(product, index) in products"
          :key="product.id"
          type="button"
          class="market-featured-dot"
          :aria-label="`${t('creatorMarketplace.featured')}: ${product.title}`"
          :aria-current="index === activeIndex ? 'true' : undefined"
          @click="swiper?.slideTo(index)"
        />
      </div>
      <t-button theme="default" variant="text" shape="square" :aria-label="t('creatorMarketplace.nextFeatured')" @click="swiper?.slideNext()">
        <t-icon name="chevron-right" />
      </t-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Autoplay } from 'swiper/modules'
import type { Swiper as SwiperInstance } from 'swiper'
import type { MarketplaceProduct } from '@/api/creator-marketplace'
import { formatMarketPrice, isFreeMarketProduct } from './marketplacePresentation'
import 'swiper/css'

const props = defineProps<{ products: MarketplaceProduct[] }>()
const { t, locale } = useI18n()
const multiple = computed(() => props.products.length > 1)
const swiper = shallowRef<SwiperInstance>()
const activeIndex = ref(0)
const hovered = ref(false)
const focused = ref(false)
const motionPreference = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined
const reducedMotion = ref(motionPreference?.matches ?? false)

const price = (product: MarketplaceProduct) => isFreeMarketProduct(product)
  ? t('creatorMarketplace.free')
  : formatMarketPrice(product.monthly_amount, product.currency, locale.value)

function syncAutoplay() {
  const instance = swiper.value
  if (!instance || instance.destroyed) return
  const shouldRun = multiple.value && !reducedMotion.value && !hovered.value && !focused.value
  if (shouldRun && !instance.autoplay.running) instance.autoplay.start()
  else if (!shouldRun && instance.autoplay.running) instance.autoplay.stop()
}

function onSwiper(instance: SwiperInstance) {
  swiper.value = instance
  activeIndex.value = instance.realIndex
  syncAutoplay()
}

function onSlideChange(instance: SwiperInstance) {
  activeIndex.value = instance.realIndex
}

function onFocusOut(event: FocusEvent) {
  focused.value = event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)
}

function onMotionPreferenceChange(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches
}

watch([multiple, reducedMotion, hovered, focused], syncAutoplay)
motionPreference?.addEventListener('change', onMotionPreferenceChange)
onBeforeUnmount(() => motionPreference?.removeEventListener('change', onMotionPreferenceChange))
</script>

<style scoped>
.market-featured-carousel { min-width: 0; }
.market-featured-swiper { width: 100%; }
.market-featured-controls { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px; }
.market-featured-dots { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; }
.market-featured-dot { display: grid; place-items: center; width: 28px; height: 32px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.market-featured-dot::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--td-component-stroke); }
.market-featured-dot[aria-current="true"]::after { background: var(--td-text-color-primary); }
.market-featured-dot:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 1px; }
</style>
