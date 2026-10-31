<template>
  <div v-if="open" class="choice-overlay" @click.self="close" @keydown.esc="close">
    <div class="choice-dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <p id="share-title" class="choice-title">Share “{{ card?.name }}”</p>
      <p v-if="error" class="share-error">{{ error }}</p>

      <!-- Members -->
      <section class="share-section">
        <h3>Who has this card</h3>
        <p v-if="!members" class="share-muted">Loading…</p>
        <ul v-else class="share-members">
          <li v-for="m in members" :key="m.user_id">
            <span class="share-name">{{ m.name || 'A player' }}<template v-if="m.user_id === me"> (you)</template></span>
            <select
              v-if="isOwner"
              :value="m.role"
              :disabled="busy"
              :aria-label="`Role of ${m.name}`"
              @change="setRole(m, $event.target.value)"
            >
              <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_NAMES[r] }}</option>
            </select>
            <span v-else class="share-role">{{ ROLE_NAMES[m.role] || m.role }}</span>
            <button
              v-if="isOwner && m.user_id !== me"
              class="choice-btn small"
              :disabled="busy"
              @click="remove(m)"
            >Remove</button>
            <button
              v-else-if="!isOwner && m.user_id === me"
              class="choice-btn small"
              :disabled="busy"
              @click="leave(m)"
            >Leave</button>
          </li>
        </ul>
      </section>

      <!-- Invitations: owners only -->
      <section v-if="isOwner" class="share-section">
        <h3>Invite your partner</h3>
        <p class="share-muted">
          Send them a link. Whoever opens it while signed in to Bridge Classroom joins the card.
          Links last 30 days.
        </p>
        <div class="share-row">
          <select v-model="inviteRole" :disabled="busy" aria-label="Role for the invitation">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button class="choice-btn primary" :disabled="busy" @click="invite">Make a link</button>
        </div>
        <ul v-if="invitations?.length" class="share-links">
          <li v-for="inv in invitations" :key="inv.token">
            <span class="share-role">{{ inv.role === 'editor' ? 'Can edit' : 'Can view' }}</span>
            <input class="share-url" :value="inv.url" readonly @focus="$event.target.select()" />
            <button class="choice-btn small" @click="copy(inv.url, inv.token)">{{ copied === inv.token ? 'Copied' : 'Copy' }}</button>
            <button class="choice-btn small" :disabled="busy" @click="revoke(inv)">Revoke</button>
            <span class="share-muted share-expires">until {{ day(inv.expires_at) }}</span>
          </li>
        </ul>
      </section>

      <!-- Print link: any member -->
      <section class="share-section">
        <h3>Link to the card's PDF</h3>
        <p class="share-muted">
          For RealBridge and other sites that ask for your card. Anyone with the link can view it,
          and it shows the card as it is now. The link works while the card is saved in Bridge
          Classroom. It isn't a backup: keep your own copy with Export PDF.
        </p>
        <div class="share-row">
          <select v-model="template" :disabled="busy" aria-label="Card layout">
            <option value="classic">ACBL Classic</option>
            <option value="new">ACBL New</option>
          </select>
          <button class="choice-btn" :disabled="busy" @click="getPrintLink">{{ printUrl ? 'Update' : 'Get the link' }}</button>
        </div>
        <div v-if="printUrl" class="share-row">
          <input class="share-url" :value="printUrl" readonly @focus="$event.target.select()" />
          <button class="choice-btn small" @click="copy(printUrl, 'print')">{{ copied === 'print' ? 'Copied' : 'Copy' }}</button>
        </div>
      </section>

      <div class="choice-buttons">
        <button class="choice-btn" @click="close">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

// Sharing a saved card (DESIGN.md, "Shared cards"): its members and their
// roles, invitation links (owners), and the read-only link to its PDF (any
// member). Everything goes through the storage adapter's sharing methods
// (useCardEditor.js). Emits 'left' when the user leaves the card.
const props = defineProps({
  storage: { type: Object, required: true },
  card: { type: Object, default: null },
})
const emit = defineEmits(['left'])

const ROLES = ['owner', 'editor', 'viewer']
const ROLE_NAMES = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' }

const open = ref(false)
const members = ref(null)
const invitations = ref(null)
const inviteRole = ref('editor')
const template = ref('classic')
const printUrl = ref(null)
const busy = ref(false)
const error = ref(null)
const copied = ref(null)

const me = computed(() => props.storage.user?.value?.id)
const isOwner = computed(() => {
  const card = props.card
  return !!card && (card.role ? card.role === 'owner' : card.owner_id === me.value)
})

async function run(what, fn) {
  busy.value = true
  error.value = null
  try {
    return await fn()
  } catch (err) {
    error.value = `${what}: ${err?.message || err}`
  } finally {
    busy.value = false
  }
}

async function refresh() {
  const id = props.card.id
  members.value = await props.storage.members(id)
  invitations.value = isOwner.value && props.storage.invitations ? await props.storage.invitations(id) : null
}

/** Open the dialog for the card. */
async function show() {
  open.value = true
  members.value = null
  invitations.value = null
  printUrl.value = null
  error.value = null
  await run('Could not load who has this card', refresh)
}

function close() {
  open.value = false
}

const setRole = (m, role) => run('Could not change the role', async () => {
  await props.storage.setRole(props.card.id, m.user_id, role)
  await refresh()
})

const remove = m => run('Could not remove them', async () => {
  if (!confirm(`Remove ${m.name || 'this player'} from the card?`)) return
  await props.storage.removeMember(props.card.id, m.user_id)
  await refresh()
})

const leave = m => run('Could not leave the card', async () => {
  if (!confirm(`Leave "${props.card.name}"? It comes off your list, and you'll need a new invitation to get it back.`)) return
  await props.storage.removeMember(props.card.id, m.user_id)
  close()
  emit('left', props.card.id)
})

const invite = () => run('Could not make the link', async () => {
  const made = await props.storage.invite(props.card.id, inviteRole.value)
  await refresh()
  copied.value = null
  if (!invitations.value) invitations.value = [{ ...made, role: inviteRole.value }]
})

const revoke = inv => run('Could not revoke the link', async () => {
  await props.storage.revokeInvitation(props.card.id, inv.token)
  await refresh()
})

const getPrintLink = () => run('Could not get the link', async () => {
  printUrl.value = (await props.storage.printLink(props.card.id, template.value)).url
})

async function copy(text, key) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
  } catch {
    error.value = 'Could not copy: select the link and copy it'
  }
}

const day = iso => (iso ? new Date(iso).toLocaleDateString() : '')

defineExpose({ show })
</script>

<style scoped>
.choice-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 24, 39, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.choice-dialog {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  padding: 20px 22px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  font-size: 15px;
  color: var(--text-primary, #1a1a1a);
}
.choice-title { font-weight: 600; margin: 0 0 12px; }
.share-section { padding: 12px 0; border-top: 1px solid var(--card-border, #e0ddd7); }
.share-section h3 { font-size: 15px; margin: 0 0 6px; color: var(--green-dark, #2d6a4f); }
.share-muted { color: var(--text-secondary, #6b7280); font-size: 13px; margin: 0 0 8px; line-height: 1.45; }
.share-error { color: #b91c1c; margin: 0 0 8px; }
.share-members, .share-links { list-style: none; margin: 0; padding: 0; }
.share-members li, .share-links li { display: flex; align-items: center; gap: 8px; padding: 4px 0; flex-wrap: wrap; }
.share-name { flex: 1 1 auto; min-width: 8em; }
.share-role { color: var(--text-secondary, #6b7280); font-size: 13px; }
.share-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.share-url { flex: 1 1 14em; min-width: 0; font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid var(--card-border, #d1d5db); border-radius: 6px; }
.share-expires { font-size: 12px; }
select { font: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid var(--card-border, #d1d5db); border-radius: 6px; background: #fff; }
.choice-buttons { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.choice-btn {
  font: inherit;
  font-size: 14px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--card-border, #d1d5db);
  background: #fff;
  cursor: pointer;
}
.choice-btn.small { font-size: 13px; padding: 4px 10px; }
.choice-btn.primary {
  background: var(--green-dark, #2d6a4f);
  border-color: var(--green-dark, #2d6a4f);
  color: #fff;
  font-weight: 600;
}
.choice-btn:disabled { opacity: 0.5; cursor: default; }
</style>
