<script lang="ts">
import type { PermissionCode } from '@/api/types'

export interface RoleFormValue {
  name: string
  permissions: PermissionCode[]
  /** 'global' or a client id; only used when `scopeOptions` is given (platform admin, new role). */
  client: string
}
</script>

<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '@/components/AppSelect.vue'
import { PERMISSIONS } from '@/utils/permissions'

const props = defineProps<{
  initial: RoleFormValue
  saving: boolean
  errors: Record<string, string[]>
  /** Offer "belongs to" (global / a client). Omit to keep the role where it is. */
  scopeOptions?: { value: string; label: string }[]
  /** How many assignments use this role, to warn that edits apply to them. */
  usageCount?: number
}>()
const emit = defineEmits<{ save: [value: RoleFormValue]; cancel: [] }>()
const { t } = useI18n()

const form = reactive<RoleFormValue>({ ...props.initial, permissions: [...props.initial.permissions] })

function toggle(perm: PermissionCode) {
  form.permissions = form.permissions.includes(perm) ? form.permissions.filter((p) => p !== perm) : [...form.permissions, perm]
}
</script>

<template>
  <form class="stack" @submit.prevent="emit('save', { ...form })">
    <label>{{ t('roles.name') }} <input v-model="form.name" required maxlength="100" />
      <span v-if="errors.name" class="field-error">{{ errors.name.join(' ') }}</span></label>
    <label v-if="scopeOptions">{{ t('roles.belongsTo') }}
      <AppSelect v-model="form.client" :options="scopeOptions" /></label>
    <fieldset class="perms">
      <legend>{{ t('roles.permissions') }}</legend>
      <label v-for="p in PERMISSIONS" :key="p" class="perm">
        <input type="checkbox" :checked="form.permissions.includes(p)" @change="toggle(p)" />
        <span><strong>{{ t(`perm.${p}`) }}</strong><span class="muted small">{{ t(`permHelp.${p}`) }}</span></span>
      </label>
      <span v-if="errors.permissions" class="field-error">{{ errors.permissions.join(' ') }}</span>
    </fieldset>
    <p v-if="usageCount" class="banner banner-info small">{{ t('roles.inUseNote', { n: usageCount }) }}</p>
    <div class="row">
      <button class="btn-primary" :disabled="saving">{{ saving ? t('giftForm.saving') : t('common.save') }}</button>
      <button type="button" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    </div>
  </form>
</template>

<style scoped>
.perms { border: 1px solid var(--c-border); border-radius: var(--radius-md); padding: 8px 12px; margin: 0; display: grid; gap: 4px; }
.perms legend { padding: 0 4px; font-size: 0.9rem; font-weight: 500; }
.perm { flex-direction: row; align-items: flex-start; gap: 10px; padding: 6px 0; font-weight: 400; cursor: pointer; }
.perm input { width: 18px; min-height: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; }
.perm > span { display: flex; flex-direction: column; }
</style>
