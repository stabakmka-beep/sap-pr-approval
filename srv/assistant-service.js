const cds = require('@sap/cds')
const { mockAnswer } = require('./lib/assistant/mock-llm')
const { aiCoreBound, completeWithTools, SYSTEM, toReply } = require('./lib/assistant/aicore')
const { takeConfirmation } = require('./lib/assistant/confirmations')

const log = cds.log('assistant')

function historyMessages(raw) {
  if (!raw) return []
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.slice(-12).filter(turn => {
    return turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string'
  }).map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) }))
}

module.exports = cds.service.impl(function () {
  this.on('chat', async (req) => {
    const message = String(req.data.message || '').trim()
    if (!message) req.reject(400, 'A message is required')
    const history = historyMessages(req.data.history)
    if (history === null) req.reject(400, 'history must be a JSON array of {role, content}')

    if (aiCoreBound()) {
      try {
        return await completeWithTools({
          user: req.user,
          messages: [
            { role: 'system', content: SYSTEM },
            ...history,
            { role: 'user', content: message }
          ]
        })
      } catch (error) {
        log.warn('Generative AI Hub call failed; using the local assistant', error.message)
      }
    }

    return toReply(await mockAnswer(message, req.user), 'mock')
  })

  this.on('confirm', async (req) => {
    const token = String(req.data.token || '').trim()
    if (!token) req.reject(400, 'A confirmation token is required')
    const taken = takeConfirmation(token, req.user.id)
    if (taken.error) req.reject(taken.status, taken.error)

    const approver = cds.services.ApproverService
    const event = taken.entry.action === 'reject' ? 'rejectRequest' : 'approve'
    let updated
    try {
      updated = await approver.tx(req)[event]('PurchaseRequests', taken.entry.requestId, {
        comment: taken.entry.comment || ''
      })
    } catch (error) {
      req.reject(error.status || error.code || 403, error.message)
    }

    const verb = taken.entry.action === 'reject' ? 'Rejected' : 'Decided'
    return toReply({
      reply: `${verb} ${updated.requestNo}. It is now ${updated.status}.`,
      requestNo: updated.requestNo
    }, 'cap')
  })
})
