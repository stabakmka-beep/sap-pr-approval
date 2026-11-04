const { listPending, getRequest, proposeDecision, summarize } = require('./tools')

function numberToken(raw, suffix) {
  const value = Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return suffix ? value * 1000 : value
}

function extractRequestNo(text) {
  const match = String(text).match(/\bPR[-\s]?(\d{3,12})\b/i)
  return match ? `PR${match[1]}` : null
}

function extractComment(text) {
  const because = String(text).match(/\bbecause\b\s+(.+)$/i)
  if (because) return because[1].trim()
  const labeled = String(text).match(/\bcomment\s*:\s*(.+)$/i)
  return labeled ? labeled[1].trim() : ''
}

function extractFilter(text) {
  const filter = {}
  const over = String(text).match(/\b(?:over|above|more than|greater than)\s+\$?\s*([\d,.]+)\s*([kK])?\b/)
  if (over) filter.minAmount = numberToken(over[1], over[2])
  const under = String(text).match(/\b(?:under|below|less than)\s+\$?\s*([\d,.]+)\s*([kK])?\b/)
  if (under) filter.maxAmount = numberToken(under[1], under[2])
  const code = String(text).match(/\b(CC\d+)\b/i)
  if (code) filter.costCenter = code[1].toUpperCase()
  const from = String(text).match(/\bfrom\s+([A-Za-z][\w-]*)/i)
  if (from) filter.hint = from[1]
  return filter
}

async function resolveHint(filter) {
  if (!filter.hint || filter.costCenter || filter.requester) return filter
  const cds = require('@sap/cds')
  const centers = await cds.ql.SELECT.from('pr.CostCenters')
  const hint = filter.hint.toLowerCase()
  const center = centers.find(row => {
    const name = String(row.name || '').toLowerCase()
    const code = String(row.code || '').toLowerCase()
    return code === hint || name === hint || name.includes(hint)
  })
  if (center) return { ...filter, costCenter: center.code }
  return { ...filter, requester: filter.hint }
}

const HELP = 'Ask what is waiting for you, for example "What\'s waiting for me over $5K?", "Which requests from IT are pending?", or "Summarize PR10000002". Say "Approve PR10000002" or "Reject PR10000002 because ..." and then confirm. Nothing is decided until you confirm.'

async function mockAnswer(message, user) {
  const text = String(message || '').trim()
  if (!text) return { reply: HELP }
  const requestNo = extractRequestNo(text)
  const comment = extractComment(text)

  if (/\breject\b/i.test(text)) {
    return asReply(await proposeDecision(user, { requestNo: requestNo || await onlyPending(user), action: 'reject', comment }))
  }
  if (/\bapprove\b/i.test(text)) {
    return asReply(await proposeDecision(user, { requestNo: requestNo || await onlyPending(user), action: 'approve', comment }))
  }
  if (requestNo) {
    return asReply(summarize(await getRequest(user, requestNo)))
  }

  if (!/\b(wait|pending|inbox|request|which|what|show|list|over|above|under|below)\b/i.test(text)) {
    return { reply: HELP }
  }
  const filter = await resolveHint(extractFilter(text))
  const listed = await listPending(user, filter)
  return asReply(summarize(listed))
}

async function onlyPending(user) {
  const listed = await listPending(user, {})
  if (listed.requests?.length === 1) return listed.requests[0].requestNo
  return null
}

function asReply(result) {
  if (result.confirmationRequired) return result
  if (result.reply) return result
  return { reply: result.error || HELP }
}

module.exports = { mockAnswer, extractFilter, extractRequestNo, HELP }
