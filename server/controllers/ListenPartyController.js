const Logger = require('../Logger')
const Database = require('../Database')

class ListenPartyController {
  constructor() {}

  async getInvites(req, res) {
    const invites = this.listenPartyManager.getInvitesForUser(req.user.id)
    res.json({ invites })
  }

  async getInvitees(req, res) {
    const libraryItemId = req.params.libraryItemId
    const libraryItem = await Database.libraryItemModel.getExpandedById(libraryItemId)
    if (!libraryItem) return res.sendStatus(404)
    if (!req.user.checkCanAccessLibraryItem(libraryItem)) return res.sendStatus(403)

    const users = await Database.userModel.findAll()
    const invitees = users
      .filter((user) => user.isActive)
      .filter((user) => user.id !== req.user.id)
      .filter((user) => user.checkCanAccessLibraryItem(libraryItem))
      .map((user) => ({ id: user.id, username: user.username }))

    res.json({ users: invitees })
  }

  async createParty(req, res) {
    const { libraryItemId, episodeId, invitedUserIds, initialState } = req.body || {}
    if (!libraryItemId) return res.status(400).send('libraryItemId is required')

    const libraryItem = await Database.libraryItemModel.getExpandedById(libraryItemId)
    if (!libraryItem) return res.sendStatus(404)
    if (!req.user.checkCanAccessLibraryItem(libraryItem)) return res.sendStatus(403)

    const party = this.listenPartyManager.createParty(req.user, libraryItem, episodeId, [], initialState || {})

    if (Array.isArray(invitedUserIds) && invitedUserIds.length) {
      const users = await Database.userModel.findAll({ where: { id: invitedUserIds } })
      const invitees = users.filter((user) => user.isActive && user.checkCanAccessLibraryItem(libraryItem))
      this.listenPartyManager.addInvites(party, invitees)
    }

    res.json({ party: this.listenPartyManager.toClientParty(party) })
  }

  async joinParty(req, res) {
    const partyId = req.params.id
    const party = this.listenPartyManager.getParty(partyId)
    if (!party) return res.sendStatus(404)

    if (!party.invitedUserIds.has(req.user.id) && !party.members.has(req.user.id)) {
      return res.sendStatus(403)
    }

    const libraryItem = await Database.libraryItemModel.getExpandedById(party.libraryItemId)
    if (!libraryItem) return res.sendStatus(404)
    if (!req.user.checkCanAccessLibraryItem(libraryItem)) return res.sendStatus(403)

    this.listenPartyManager.joinParty(req.user, party)
    res.json({ party: this.listenPartyManager.toClientParty(party) })
  }

  async leaveParty(req, res) {
    const partyId = req.params.id
    const party = this.listenPartyManager.getParty(partyId)
    if (!party) return res.sendStatus(404)

    this.listenPartyManager.leaveParty(req.user.id, party)
    res.sendStatus(200)
  }

  async action(req, res) {
    const partyId = req.params.id
    const party = this.listenPartyManager.getParty(partyId)
    if (!party) return res.sendStatus(404)

    if (!party.members.has(req.user.id)) {
      Logger.warn(`[ListenPartyController] User ${req.user.username} attempted to control party ${partyId} without membership`)
      return res.sendStatus(403)
    }

    const { actionType, position, playbackRate, actionId } = req.body || {}
    const allowed = ['play', 'pause', 'seek', 'rate']
    if (!allowed.includes(actionType)) {
      return res.status(400).send('Invalid actionType')
    }

    this.listenPartyManager.applyAction(req.user.id, party, {
      actionType,
      position,
      playbackRate,
      actionId
    })

    res.sendStatus(200)
  }

  async invite(req, res) {
    const partyId = req.params.id
    const party = this.listenPartyManager.getParty(partyId)
    if (!party) return res.sendStatus(404)

    if (!party.members.has(req.user.id)) {
      return res.sendStatus(403)
    }

    const invitedUserIds = req.body?.invitedUserIds || []
    if (!Array.isArray(invitedUserIds) || !invitedUserIds.length) {
      return res.status(400).send('invitedUserIds is required')
    }

    const libraryItem = await Database.libraryItemModel.getExpandedById(party.libraryItemId)
    if (!libraryItem) return res.sendStatus(404)

    const users = await Database.userModel.findAll({ where: { id: invitedUserIds } })
    const invitees = users.filter((user) => user.isActive && user.checkCanAccessLibraryItem(libraryItem))
    this.listenPartyManager.addInvites(party, invitees)

    res.json({ party: this.listenPartyManager.toClientParty(party) })
  }

  async kick(req, res) {
    const partyId = req.params.id
    const party = this.listenPartyManager.getParty(partyId)
    if (!party) return res.sendStatus(404)

    if (!party.members.has(req.user.id)) {
      return res.sendStatus(403)
    }

    const userId = req.body?.userId
    if (!userId) return res.status(400).send('userId is required')

    this.listenPartyManager.kickUser(party, userId)
    res.sendStatus(200)
  }
}

module.exports = new ListenPartyController()
