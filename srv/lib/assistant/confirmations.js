const crypto = require('crypto')

const pending = new Map()
const TEN_MINUTES = 10 * 60 * 1000

function issueConfirmation(entry) {
  const token = crypto.randomBytes(16).toString('hex')
  pending.set(token, { ...entry, expiresAt: Date.now() + TEN_MINUTES })
  return token
}

/**
 * Read a proposal once. A token for someone else is left in place.
 * A used or expired token is removed.
 */
function takeConfirmation(token, userId) {
  const entry = pending.get(token)
  if (!entry) return { error: 'That confirmation is unknown or was already used. Ask the assistant again.', status: 400 }
  if (entry.expiresAt < Date.now()) {
    pending.delete(token)
    return { error: 'That confirmation expired. Ask the assistant again.', status: 400 }
  }
  if (entry.userId !== userId) {
    return { error: 'This confirmation belongs to a different user.', status: 403 }
  }
  pending.delete(token)
  return { entry }
}

module.exports = { issueConfirmation, takeConfirmation }
