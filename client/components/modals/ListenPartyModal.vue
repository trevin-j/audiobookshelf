<template>
  <modals-modal v-model="show" name="listen-party-modal" :width="720" :height="'unset'">
    <div class="w-full rounded-lg bg-bg box-shadow-md overflow-y-auto overflow-x-hidden p-6" style="max-height: 80vh">
      <div class="flex items-center justify-between mb-4">
        <p class="text-lg md:text-2xl text-white">{{ $strings.HeaderListenParty }}</p>
        <ui-btn v-if="activeParty" small color="bg-error" @click.stop="leaveParty">{{ $strings.ButtonLeaveParty }}</ui-btn>
      </div>

      <div v-if="activeParty" class="mb-6">
        <p class="text-gray-200 text-base">{{ activeParty.displayTitle }}</p>
        <p v-if="activeParty.displayAuthor" class="text-gray-400 text-xs">{{ $getString('LabelByAuthor', [activeParty.displayAuthor]) }}</p>
        <div class="flex items-center text-xs text-gray-300 mt-2">
          <span class="material-symbols text-sm mr-1">group</span>
          <p>{{ $getString('LabelPartyMembers', [activeParty.members.length]) }}</p>
        </div>
        <div class="flex items-center text-xs text-gray-300 mt-1">
          <span class="material-symbols text-sm mr-1">schedule</span>
          <p>{{ $secondsToTimestamp(activeParty.state.position) }} • {{ activeParty.state.isPlaying ? $strings.LabelPlaying : $strings.LabelPaused }}</p>
        </div>

        <div class="mt-4">
          <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.HeaderPartyMembers }}</p>
          <div v-for="member in activeParty.members" :key="member.id" class="text-sm text-gray-200 mb-1">{{ member.username }}</div>
        </div>
      </div>

      <div v-if="!activeParty && invites.length" class="mb-6">
        <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.HeaderPartyInvites }}</p>
        <div v-for="invite in invites" :key="invite.id" class="flex items-center justify-between bg-primary/40 rounded-md px-3 py-2 mb-2">
          <div class="min-w-0">
            <p class="text-sm text-gray-200 truncate">{{ invite.displayTitle }}</p>
            <p v-if="invite.displayAuthor" class="text-xs text-gray-400 truncate">{{ $getString('LabelByAuthor', [invite.displayAuthor]) }}</p>
          </div>
          <ui-btn small color="bg-success" @click.stop="joinParty(invite)">{{ $strings.ButtonJoin }}</ui-btn>
        </div>
      </div>

      <div v-if="!activeParty" class="mt-2">
        <p class="font-semibold uppercase text-xs text-gray-400 tracking-wide mb-2">{{ $strings.HeaderCreateParty }}</p>
        <div v-if="!createContext">
          <p class="text-sm text-gray-300">{{ $strings.MessageStartPlaybackToCreateParty }}</p>
        </div>
        <div v-else>
          <p class="text-sm text-gray-200 mb-3">
            {{ $getString('LabelPartyForItem', [createContext.displayTitle || $strings.LabelUnknown]) }}
          </p>
          <ui-multi-select-dropdown v-model="selectedInvitees" :items="inviteeOptions" :label="$strings.LabelInviteUsers" class="mb-3" />
          <ui-btn :disabled="creating" color="bg-primary" @click.stop="createParty">{{ $strings.ButtonCreateParty }}</ui-btn>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  data() {
    return {
      selectedInvitees: [],
      inviteeOptions: [],
      creating: false
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.listenParty.showModal
      },
      set(val) {
        this.$store.commit('listenParty/setShowModal', val)
      }
    },
    activeParty() {
      return this.$store.state.listenParty.activeParty
    },
    invites() {
      return this.$store.state.listenParty.invites || []
    },
    createContext() {
      return this.$store.state.listenParty.createContext
    }
  },
  watch: {
    show(val) {
      if (val) {
        this.loadInvitees()
      } else {
        this.selectedInvitees = []
      }
    }
  },
  methods: {
    async loadInvitees() {
      if (!this.createContext?.libraryItemId) return
      const result = await this.$axios.$get(`/api/listen-parties/invitees/${this.createContext.libraryItemId}`).catch((error) => {
        console.error('Failed to load invitees', error)
        return null
      })
      this.inviteeOptions = (result?.users || []).map((user) => ({
        text: user.username,
        value: user.id
      }))
    },
    async createParty() {
      if (!this.createContext?.libraryItemId) return
      this.creating = true
      const payload = {
        libraryItemId: this.createContext.libraryItemId,
        episodeId: this.createContext.episodeId,
        invitedUserIds: this.selectedInvitees,
        initialState: {
          position: this.createContext.position || 0,
          isPlaying: this.createContext.isPlaying,
          playbackRate: this.createContext.playbackRate || 1
        }
      }
      const party = await this.$store.dispatch('listenParty/createParty', payload)
      if (party) {
        this.$toast.success(this.$strings.ToastListenPartyCreated)
        this.show = false
      } else {
        this.$toast.error(this.$strings.ToastListenPartyCreateFailed)
      }
      this.creating = false
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
      this.show = false
    },
    async leaveParty() {
      if (!this.activeParty?.id) return
      await this.$store.dispatch('listenParty/leaveParty', this.activeParty.id)
      this.show = false
    }
  }
}
</script>
