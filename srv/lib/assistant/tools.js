const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { readPurchaseRequest, callerRoles } = require('../purchase-request')
const { issueConfirmation } = require('./confirmations')

async function costCenters() {
  return SELECT.from('pr.CostCenters')
}

function centerName(centers, code) {
  return centers.find(center => center.code === code)?.name || ''
}

function canSee(user, row) {
  if (!row || !user) return false
  if (user.id && row.requester === user.id) return true
  return Boolean(row.pendingApproverRole && user.is?.(row.pendingApproverRole))
}

function canDecide(user, row) {
  return Boolean(row?.status === 'Submitted' && row.pendingApproverRole && user?.is?.(row.pendingApproverRole))
}

function money(row) {
  const amount = Number(row.totalAmount)
  const formatted = Number.isFinite(amount) ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(row.totalAmount)
  const currency = row.currency_code || row.currency?.code || ''
  return `${formatted} ${currency}`.trim()
}

function publicRow(row, centers) {
  return {
    requestNo: row.requestNo,
    description: row.description,
    requester: row.requester,
    costCenter: row.costCenter,
    costCenterName: centerName(centers, row.costCenter),
    totalAmount: Number(row.totalAmount),
    currency: row.currency_code || row.currency?.code || '',
    status: row.status,
    currentLevel: row.currentLevel,
    pendingApproverRole: row.pendingApproverRole,
    items: (row.items || []).map(item => ({
      shortText: item.shortText,
      quantity: Number(item.quantity),
      unit: item.unit,
      netAmount: Number(item.netAmount)
    }))
  }
}

async function loadByRequestNo(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  const exact = 'PR' + (digits.length > 8 ? digits.slice(-8) : digits.padStart(8, '0'))
  const rows = await SELECT.from('pr.PurchaseRequests').columns('ID', 'requestNo')
  const match = rows.find(row => row.requestNo === exact)
    || rows.filter(row => row.requestNo.endsWith(digits)).length === 1
      && rows.find(row => row.requestNo.endsWith(digits))
  if (!match) return null
  return readPurchaseRequest(match.ID)
}

async function visibleRequests(user) {
  const roles = callerRoles(user)
  if (!roles.length) return []
  return SELECT.from('pr.PurchaseRequests')
    .where({ status: 'Submitted', pendingApproverRole: { in: roles } })
    .columns(request => {
      request('*')
      request.items(item => { item('*') })
    })
}

function matches(row, filter, centers) {
  const amount = Number(row.totalAmount)
  if (filter.minAmount != null && !(amount > Number(filter.minAmount))) return false
  if (filter.maxAmount != null && !(amount < Number(filter.maxAmount))) return false
  if (filter.requester && !String(row.requester || '').toLowerCase().includes(String(filter.requester).toLowerCase())) return false
  if (filter.costCenter) {
    const needle = String(filter.costCenter).toLowerCase()
    const name = centerName(centers, row.costCenter).toLowerCase()
    const code = String(row.costCenter || '').toLowerCase()
    const hit = code === needle || name === needle || name.includes(needle)
    if (!hit) return false
  }
  return true
}

async function listPending(user, filter = {}) {
  const roles = callerRoles(user)
  if (!roles.length) {
    return { error: 'You do not have an approver role, so nothing is waiting for you to decide.' }
  }
  const centers = await costCenters()
  const rows = await visibleRequests(user)
  const requests = rows
    .filter(row => matches(row, filter, centers))
    .map(row => publicRow(row, centers))
  return { requests }
}

async function getRequest(user, requestNo) {
  const row = await loadByRequestNo(requestNo)
  if (!row) return { error: `I can't find a purchase request for ${requestNo}.` }
  if (!canSee(user, row)) return { error: `You can't see ${row.requestNo}.` }
  const centers = await costCenters()
  return { request: publicRow(row, centers) }
}

async function proposeDecision(user, { requestNo, action, comment }) {
  const verb = action === 'reject' ? 'reject' : 'approve'
  const row = await loadByRequestNo(requestNo)
  if (!row) return { error: `I can't find a purchase request for ${requestNo}.` }
  if (!canSee(user, row)) return { error: `You can't see ${row.requestNo}, so you can't ${verb} it.` }
  if (!canDecide(user, row)) {
    const role = row.pendingApproverRole ? ` Role ${row.pendingApproverRole} is required.` : ''
    return { error: `You can't ${verb} ${row.requestNo}.${role} Nothing was changed.` }
  }
  const note = String(comment || '').trim()
  if (action === 'reject' && !note) {
    return { error: `A comment is required to reject ${row.requestNo}. Nothing was changed.` }
  }
  const centers = await costCenters()
  const view = publicRow(row, centers)
  const token = issueConfirmation({
    userId: user.id,
    action: verb,
    requestId: row.ID,
    requestNo: row.requestNo,
    comment: note
  })
  const where = view.costCenterName ? `${view.costCenterName} (${view.costCenter})` : view.costCenter
  return {
    confirmationRequired: true,
    confirmToken: token,
    proposedAction: verb,
    requestNo: row.requestNo,
    reply: `I can ${verb} ${row.requestNo} (${row.description}, ${money(row)}, ${where}, requester ${row.requester}). Confirm to run it. Nothing has changed yet.`
  }
}

function summarize(result) {
  if (result.error) return { reply: result.error }
  if (result.confirmationRequired) return result
  if (result.request) {
    const row = result.request
    const items = (row.items || []).map(item => `${item.shortText} (${item.quantity} ${item.unit})`).join(', ')
    const where = row.costCenterName ? `${row.costCenterName} (${row.costCenter})` : row.costCenter
    return {
      reply: `${row.requestNo} is ${row.status}: ${row.description}. ${money(row)} for ${where}, requested by ${row.requester}. Waiting for ${row.pendingApproverRole || 'nobody'}. Items: ${items || 'none'}.`,
      requestNo: row.requestNo
    }
  }
  const requests = result.requests || []
  if (!requests.length) return { reply: 'Nothing in your inbox matches that.' }
  const lines = requests.map(row => {
    const where = row.costCenterName ? `${row.costCenterName} (${row.costCenter})` : row.costCenter
    return `${row.requestNo}: ${row.description}, ${money(row)}, ${where}, requester ${row.requester}.`
  })
  return { reply: `${requests.length} request${requests.length === 1 ? '' : 's'} waiting for you. ${lines.join(' ')}` }
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_pending',
      description: 'List purchase requests waiting for the signed-in user. Optional filters: amount, cost center code or name, requester.',
      parameters: {
        type: 'object',
        properties: {
          minAmount: { type: 'number', description: 'Keep requests whose total is strictly greater than this amount.' },
          maxAmount: { type: 'number', description: 'Keep requests whose total is strictly less than this amount.' },
          costCenter: { type: 'string', description: 'Cost center code such as CC1000, or a name such as IT.' },
          requester: { type: 'string', description: 'Requester id, such as alice.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_request',
      description: 'Get one purchase request the signed-in user is allowed to see, including items.',
      parameters: {
        type: 'object',
        properties: {
          requestNo: { type: 'string', description: 'Request number, such as PR10000002.' }
        },
        required: ['requestNo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_approve',
      description: 'Propose approving a request. Does not approve it. The user must confirm before the CAP approve action runs.',
      parameters: {
        type: 'object',
        properties: {
          requestNo: { type: 'string' },
          comment: { type: 'string' }
        },
        required: ['requestNo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_reject',
      description: 'Propose rejecting a request. Does not reject it. A comment is required. The user must confirm before the CAP rejectRequest action runs.',
      parameters: {
        type: 'object',
        properties: {
          requestNo: { type: 'string' },
          comment: { type: 'string' }
        },
        required: ['requestNo', 'comment']
      }
    }
  }
]

async function executeTool(name, args, user) {
  const input = args || {}
  if (name === 'list_pending') return listPending(user, input)
  if (name === 'get_request') return getRequest(user, input.requestNo)
  if (name === 'propose_approve') return proposeDecision(user, { ...input, action: 'approve' })
  if (name === 'propose_reject') return proposeDecision(user, { ...input, action: 'reject' })
  return { error: `Unknown tool ${name}.` }
}

module.exports = {
  listPending,
  getRequest,
  proposeDecision,
  summarize,
  executeTool,
  TOOL_DEFINITIONS,
  money
}
