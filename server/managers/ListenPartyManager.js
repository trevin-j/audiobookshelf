const uuidv4 = require('uuid').v4
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')

class ListenPartyManager {
  constructor() {
    this.parties = new Map()
  }

  getParty(partyId) {
    return this.parties.get(partyId) || null
  }

  getCurrentPosition(party, now = Date.now()) {
    if (!party.isPlaying) return party.position
    const elapsedSeconds = Math.max(0, (now - party.updatedAt) / 1000)
    return Math.max(0, Math.min(party.position + elapsedSeconds * party.playbackRate, party.duration || party.position))
  }

  clampPosition(party, position) {
    if (position == null || isNaN(position)) return 0
    const max = party.duration || Infinity
    return Math.max(0, Math.min(position, max))
  }

  buildPartyState(party, now = Date.now(), extra = {}) {
    return {
      isPlaying: party.isPlaying,
      position: this.getCurrentPosition(party, now),
      playbackRate: party.playbackRate,
      updatedAt: party.updatedAt,
      serverTime: now,
      ...extra
    }
  }

  toClientParty(party, now = Date.now(), extraState = {}) {
    return {
      id: party.id,
      libraryItemId: party.libraryItemId,
      episodeId: party.episodeId,
      libraryId: party.libraryId,
      mediaType: party.mediaType,
      displayTitle: party.displayTitle,
      displayAuthor: party.displayAuthor,
      coverPath: party.coverPath,
      duration: party.duration,
      createdBy: party.createdBy,
      createdAt: party.createdAt,
      updatedAt: party.updatedAt,
      members: Array.from(party.members.values()),
      invitedUserIds: Array.from(party.invitedUserIds),
      state: this.buildPartyState(party, now, extraState)
    }
  }

  createParty(user, libraryItem, episodeId, invitedUserIds = [], initialState = {}) {
    const now = Date.now()
    const party = {
      id: uuidv4(),
      libraryItemId: libraryItem.id,
      episodeId: episodeId || null,
      libraryId: libraryItem.libraryId,
      mediaType: libraryItem.mediaType,
      displayTitle: libraryItem.media.getPlaybackTitle(episodeId),
      displayAuthor: libraryItem.media.getPlaybackAuthor(),
      coverPath: libraryItem.media.coverPath,
      duration: libraryItem.media.getPlaybackDuration(episodeId),
      createdBy: { id: user.id, username: user.username },
      createdAt: now,
      updatedAt: now,
      isPlaying: !!initialState.isPlaying,
      playbackRate: Number(initialState.playbackRate) || 1,
      position: this.clampPosition({ duration: libraryItem.media.getPlaybackDuration(episodeId) }, initialState.position || 0),
      members: new Map(),
      invitedUserIds: new Set()
    }

    party.members.set(user.id, { id: user.id, username: user.username, joinedAt: now })

    invitedUserIds.forEach((id) => {
      if (id && id !== user.id) {
        party.invitedUserIds.add(id)
      }
    })

    this.parties.set(party.id, party)
    Logger.info(`[ListenPartyManager] Created party ${party.id} for item ${party.libraryItemId}`)
    return party
  }

  addInvites(party, invitedUsers) {
    invitedUsers.forEach((user) => {
      if (!party.members.has(user.id)) {
        party.invitedUserIds.add(user.id)
        SocketAuthority.clientEmitter(user.id, 'listen_party_invite', {
          party: this.toClientParty(party)
        })
      }
    })
  }

  kickUser(party, userId) {
    if (!party.members.has(userId)) return
    party.members.delete(userId)
    party.invitedUserIds.delete(userId)
    SocketAuthority.clientEmitter(userId, 'listen_party_closed', { id: party.id })
    if (!party.members.size) {
      this.closeParty(party)
    } else {
      party.updatedAt = Date.now()
      this.broadcastPartyUpdate(party, { actionType: 'kick', sourceUserId: userId })
    }
  }

  getInvitesForUser(userId) {
    const invites = []
    for (const party of this.parties.values()) {
      if (party.invitedUserIds.has(userId)) {
        invites.push(this.toClientParty(party))
      }
    }
    return invites
  }

  joinParty(user, party) {
    const now = Date.now()
    party.invitedUserIds.delete(user.id)
    party.members.set(user.id, { id: user.id, username: user.username, joinedAt: now })
    party.updatedAt = now
    this.broadcastPartyUpdate(party, { actionType: 'join', sourceUserId: user.id })
    return party
  }

  leaveParty(userId, party) {
    party.members.delete(userId)
    party.invitedUserIds.delete(userId)
    if (!party.members.size) {
      this.closeParty(party)
      return null
    }
    party.updatedAt = Date.now()
    this.broadcastPartyUpdate(party, { actionType: 'leave', sourceUserId: userId })
    return party
  }

  closeParty(party) {
    this.parties.delete(party.id)
    const payload = { id: party.id }
    const memberIds = Array.from(party.members.keys())
    const inviteIds = Array.from(party.invitedUserIds.values())
    const notifyIds = [...new Set([...memberIds, ...inviteIds])]
    notifyIds.forEach((userId) => SocketAuthority.clientEmitter(userId, 'listen_party_closed', payload))
    Logger.info(`[ListenPartyManager] Closed party ${party.id}`)
  }

  handleUserDisconnected(userId) {
    const partiesForUser = Array.from(this.parties.values()).filter((party) => party.members.has(userId))
    partiesForUser.forEach((party) => this.leaveParty(userId, party))
  }

  applyAction(userId, party, action) {
    const now = Date.now()
    const actionType = action.actionType
    const actionId = action.actionId || null
    const currentPosition = this.getCurrentPosition(party, now)

    if (actionType === 'play') {
      party.position = this.clampPosition(party, action.position ?? currentPosition)
      party.isPlaying = true
      party.updatedAt = now
    } else if (actionType === 'pause') {
      party.position = this.clampPosition(party, action.position ?? currentPosition)
      party.isPlaying = false
      party.updatedAt = now
    } else if (actionType === 'seek') {
      party.position = this.clampPosition(party, action.position ?? currentPosition)
      party.updatedAt = now
    } else if (actionType === 'rate') {
      party.position = this.clampPosition(party, currentPosition)
      party.playbackRate = Number(action.playbackRate) || party.playbackRate
      party.updatedAt = now
    }

    this.broadcastPartyUpdate(party, {
      actionType,
      actionId,
      sourceUserId: userId
    })
  }

  broadcastPartyUpdate(party, extraState = {}) {
    const payload = {
      party: this.toClientParty(party, Date.now(), extraState)
    }
    const memberIds = Array.from(party.members.keys())
    memberIds.forEach((userId) => SocketAuthority.clientEmitter(userId, 'listen_party_updated', payload))
  }
}

module.exports = new ListenPartyManager()
