<template>
  <div class="h-full w-full px-4 md:px-8 py-6">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <p class="text-2xl text-white">{{ $strings.HeaderListenParty }}</p>
          <p class="text-sm text-gray-400">{{ $strings.MessageListenPartyPageHelper }}</p>
        </div>
        <ui-btn v-if="activeParty" small color="bg-error" @click.stop="leaveParty">{{ $strings.ButtonLeaveParty }}</ui-btn>
      </div>

      <div v-if="activeParty" class="bg-primary/40 rounded-lg p-5 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-lg text-gray-100">{{ activeParty.displayTitle }}</p>
            <p v-if="activeParty.displayAuthor" class="text-xs text-gray-400">{{ $getString('LabelByAuthor', [activeParty.displayAuthor]) }}</p>
            <div class="flex items-center text-xs text-gray-300 mt-2">
              <span class="material-symbols text-sm mr-1">schedule</span>
              <p>{{ $secondsToTimestamp(activeParty.state.position) }} • {{ activeParty.state.isPlaying ? $strings.LabelPlaying : $strings.LabelPaused }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-xs uppercase tracking-wide text-gray-400">{{ $strings.HeaderPartyMembers }}</p>
            <p class="text-sm text-gray-200">{{ $getString('LabelPartyMembers', [activeParty.members.length]) }}</p>
          </div>
        </div>

        <div class="mt-5">
          <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.HeaderPartyMembers }}</p>
          <div v-for="member in activeParty.members" :key="member.id" class="flex items-center justify-between bg-black/30 rounded-md px-3 py-2 mb-2">
            <p class="text-sm text-gray-200">{{ member.username }}</p>
            <ui-btn v-if="canKick(member)" small color="bg-error" @click.stop="kickMember(member)">{{ $strings.ButtonKick }}</ui-btn>
          </div>
        </div>

        <div class="mt-6">
          <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.LabelInviteUsers }}</p>
          <ui-multi-select-dropdown v-model="selectedInvitees" :items="inviteeOptions" :label="$strings.LabelInviteUsers" class="mb-3" />
          <ui-btn :disabled="!selectedInvitees.length || sendingInvite" color="bg-primary" @click.stop="inviteUsers">{{ $strings.ButtonInvite }}</ui-btn>
        </div>
      </div>

      <div v-if="!activeParty && invites.length" class="bg-primary/30 rounded-lg p-5 mb-6">
        <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.HeaderPartyInvites }}</p>
        <div v-for="invite in invites" :key="invite.id" class="flex items-center justify-between bg-black/30 rounded-md px-3 py-2 mb-2">
          <div class="min-w-0">
            <p class="text-sm text-gray-200 truncate">{{ invite.displayTitle }}</p>
            <p v-if="invite.displayAuthor" class="text-xs text-gray-400 truncate">{{ $getString('LabelByAuthor', [invite.displayAuthor]) }}</p>
          </div>
          <ui-btn small color="bg-success" @click.stop="joinParty(invite)">{{ $strings.ButtonJoin }}</ui-btn>
        </div>
      </div>

      <div v-if="!activeParty && !invites.length" class="bg-primary/20 rounded-lg p-5">
        <p class="text-sm text-gray-300">{{ $strings.MessageListenPartyEmpty }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      selectedInvitees: [],
      inviteeOptions: [],
      sendingInvite: false
    }
  },
  computed: {
    activeParty() {
      return this.$store.state.listenParty.activeParty
    },
    invites() {
      return this.$store.state.listenParty.invites || []
    },
    currentUserId() {
      return this.$store.state.user.user?.id || null
    }
  },
  watch: {
    activeParty: {
      deep: true,
      handler(party) {
        if (party?.libraryItemId) {
          this.loadInvitees(party.libraryItemId)
        }
      }
    }
  },
  mounted() {
    this.$store.dispatch('listenParty/loadInvites')
    if (this.activeParty?.libraryItemId) {
      this.loadInvitees(this.activeParty.libraryItemId)
    }
  },
  methods: {
    canKick(member) {
      return member.id !== this.currentUserId
    },
    async loadInvitees(libraryItemId) {
      const result = await this.$axios.$get(`/api/listen-parties/invitees/${libraryItemId}`).catch((error) => {
        console.error('Failed to load invitees', error)
        return null
      })
      const items = (result?.users || []).map((user) => ({
        text: user.username,
        value: user.id
      }))
      const existingIds = new Set([...(this.activeParty?.members || []).map((m) => m.id), ...(this.activeParty?.invitedUserIds || [])])
      this.inviteeOptions = items.filter((item) => !existingIds.has(item.value))
    },
    async inviteUsers() {
      if (!this.activeParty?.id || !this.selectedInvitees.length) return
      this.sendingInvite = true
      await this.$axios
        .$post(`/api/listen-parties/${this.activeParty.id}/invite`, {
          invitedUserIds: this.selectedInvitees
        })
        .then((response) => {
          if (response?.party) {
            this.$store.commit('listenParty/setActiveParty', response.party)
          }
          this.selectedInvitees = []
        })
        .catch((error) => {
          console.error('Failed to invite users', error)
          this.$toast.error(this.$strings.ToastListenPartyInviteFailed)
        })
        .finally(() => {
          this.sendingInvite = false
        })
    },
    async kickMember(member) {
      if (!this.activeParty?.id) return
      await this.$axios
        .$post(`/api/listen-parties/${this.activeParty.id}/kick`, { userId: member.id })
        .catch((error) => {
          console.error('Failed to kick member', error)
          this.$toast.error(this.$strings.ToastListenPartyKickFailed)
        })
    },
    async joinParty(invite) {
      const party = await this.$store.dispatch('listenParty/joinParty', invite.id)
      if (!party) {
        this.$toast.error(this.$strings.ToastListenPartyJoinFailed)
        return
      }
      this.$eventBus.$emit('play-item', {
        libraryItemId: party.libraryItemId,
        episodeId: party.episodeId,
        startTime: party.state.position,
        playWhenReady: party.state.isPlaying
      })
    },
    async leaveParty() {
      if (!this.activeParty?.id) return
      await this.$store.dispatch('listenParty/leaveParty', this.activeParty.id)
    }
  }
}
</script>
