export const state = () => ({
  showModal: false,
  invites: [],
  activeParty: null,
  lastActionId: null,
  createContext: null
})

export const getters = {
  hasInvites: (state) => state.invites.length > 0,
  isInParty: (state) => !!state.activeParty,
  activePartyId: (state) => state.activeParty?.id || null
}

export const actions = {
  async loadInvites({ commit }) {
    const result = await this.$axios.$get('/api/listen-parties/invites').catch((error) => {
      console.error('Failed to load listen party invites', error)
      return null
    })
    if (result?.invites) {
      commit('setInvites', result.invites)
    }
  },
  async createParty({ commit }, payload) {
    const result = await this.$axios.$post('/api/listen-parties', payload).catch((error) => {
      console.error('Failed to create listen party', error)
      return null
    })
    if (result?.party) {
      commit('setActiveParty', result.party)
      commit('removeInvite', result.party.id)
    }
    return result?.party || null
  },
  async joinParty({ commit }, partyId) {
    const result = await this.$axios.$post(`/api/listen-parties/${partyId}/join`).catch((error) => {
      console.error('Failed to join listen party', error)
      return null
    })
    if (result?.party) {
      commit('setActiveParty', result.party)
      commit('removeInvite', result.party.id)
    }
    return result?.party || null
  },
  async leaveParty({ commit }, partyId) {
    await this.$axios.$post(`/api/listen-parties/${partyId}/leave`).catch((error) => {
      console.error('Failed to leave listen party', error)
    })
    commit('clearActiveParty')
  },
  async sendAction({ commit, state }, payload) {
    if (!payload?.partyId) return
    const actionId = payload.actionId || Math.random().toString(36).slice(2, 10)
    commit('setLastActionId', actionId)
    await this.$axios
      .$post(`/api/listen-parties/${payload.partyId}/action`, {
        actionType: payload.actionType,
        position: payload.position,
        playbackRate: payload.playbackRate,
        actionId
      })
      .catch((error) => {
        console.error('Failed to send listen party action', error)
      })
  },
  handleInvite({ commit }, invite) {
    if (!invite?.party?.id) return
    commit('addInvite', invite.party)
  },
  handlePartyUpdated({ commit, rootState }, payload) {
    const party = payload?.party
    const userId = rootState.user.user?.id
    if (!party?.id || !userId) return
    const isMember = party.members?.some((member) => member.id === userId)
    const isInvited = party.invitedUserIds?.includes(userId)
    if (isMember) {
      commit('setActiveParty', party)
      commit('removeInvite', party.id)
    } else if (isInvited) {
      commit('addInvite', party)
    } else {
      commit('removeInvite', party.id)
    }
  },
  handlePartyClosed({ commit, state }, payload) {
    const partyId = payload?.id || payload
    if (!partyId) return
    commit('removeInvite', partyId)
    if (state.activeParty?.id === partyId) {
      commit('clearActiveParty')
    }
  }
}

export const mutations = {
  setShowModal(state, val) {
    state.showModal = !!val
  },
  setInvites(state, invites) {
    state.invites = invites || []
  },
  addInvite(state, invite) {
    if (!invite?.id) return
    const exists = state.invites.some((item) => item.id === invite.id)
    if (!exists) state.invites.push(invite)
  },
  removeInvite(state, partyId) {
    state.invites = state.invites.filter((invite) => invite.id !== partyId)
  },
  setActiveParty(state, party) {
    state.activeParty = party
  },
  clearActiveParty(state) {
    state.activeParty = null
  },
  setLastActionId(state, actionId) {
    state.lastActionId = actionId
  },
  setCreateContext(state, context) {
    state.createContext = context
  }
}
