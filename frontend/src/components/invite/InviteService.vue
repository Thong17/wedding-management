<script setup lang="ts">
import type { InviteLabels } from '@/invite/labels'

/**
 * The last page of every invitation, after the card: about the service that made it, with a link to
 * contact us on Telegram. In the invitation's colours and language.
 */
defineProps<{ labels: InviteLabels }>()

/** Where guests reach us. */
const TELEGRAM = 'https://t.me/+855966176917'
</script>

<template>
  <aside class="service">
    <p class="made-with">{{ labels.serviceMadeWith }}</p>
    <div class="service-card invite-frame">
      <svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
        <!-- Two rings, linked. -->
        <circle cx="19" cy="26" r="10" />
        <circle cx="29" cy="26" r="10" />
        <path d="M24 6l3 5h-6z" />
      </svg>
      <h2>{{ labels.serviceTitle }}</h2>
      <p class="text">{{ labels.serviceText }}</p>
      <p class="features">{{ labels.serviceFeatures }}</p>
      <a class="contact" :href="TELEGRAM" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.5 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.6.2 1.8-.8l3.2-15.2c.3-1.3-.5-1.9-1.4-1.6zM8.6 13.6l9.6-6.1c.5-.3.9-.1.5.2l-8.1 7.3-.3 3.4z" />
        </svg>
        {{ labels.serviceContact }}
      </a>
    </div>
  </aside>
</template>

<style scoped>
.service {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(100% - 32px, 520px);
  margin: clamp(36px, 8cqi, 64px) auto clamp(32px, 6cqi, 48px);
  text-align: center;
  color: var(--ink);
}
.made-with {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--gold);
  font-weight: 600;
}
.made-with:lang(km) { letter-spacing: 0.02em; text-transform: none; font-size: 0.85rem; }
.service-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: clamp(22px, 6cqi, 32px) clamp(18px, 6cqi, 32px);
  border-radius: var(--r-lg, 18px);
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  --ornate-shadow: 0 16px 40px color-mix(in srgb, var(--ink) 12%, transparent);
}
.mark { width: 44px; height: 44px; fill: none; stroke: var(--gold); stroke-width: 2; }
.mark path { fill: var(--gold); stroke: none; }
h2 { margin: 0; font-size: clamp(1.15rem, 4.4cqi, 1.45rem); line-height: 1.35; font-weight: 600; }
.text { margin: 0; font-size: 0.95em; line-height: 1.6; opacity: 0.85; max-width: 30em; }
.features { margin: 0; font-size: 0.8em; color: var(--gold); font-weight: 600; letter-spacing: 0.04em; }
.contact {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 22px;
  border-radius: 999px;
  corner-shape: round;
  background: #229ed9;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 8px 20px rgb(34 158 217 / 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.contact:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgb(34 158 217 / 0.45); }
.contact svg { width: 20px; height: 20px; fill: currentColor; }
</style>
