const cds = require('@sap/cds')
const { INSERT, UPDATE } = cds.ql
const { readPurchaseRequest, requestId, callerRoles } = require('./lib/purchase-request')
const { loadApprovalChain } = require('./lib/approval-chain')
const { createS4PurchaseRequisition } = require('./lib/s4-client')

module.exports = cds.service.impl(function () {
  const { PurchaseRequests } = this.entities

  this.before('READ', PurchaseRequests, (req) => {
    const roles = callerRoles(req.user)
    req.query.where({ pendingApproverRole: { in: roles.length ? roles : ['__none__'] } })
  })

  this.on('approve', PurchaseRequests, async (req) => decide(req, 'Approved'))
  // OData name is rejectRequest. ApplicationService.reject is the error helper, so the action cannot be called reject.
  this.on('rejectRequest', PurchaseRequests, async (req) => decide(req, 'Rejected'))
})

async function decide(req, decision) {
  const id = requestId(req)
  const purchaseRequest = await readPurchaseRequest(id)
  if (!purchaseRequest) req.reject(404, 'Purchase request not found')
  if (purchaseRequest.status !== 'Submitted') {
    req.reject(409, `Request ${purchaseRequest.requestNo} is ${purchaseRequest.status}, not awaiting approval`)
  }
  if (!req.user.is(purchaseRequest.pendingApproverRole)) {
    req.reject(403, `Role ${purchaseRequest.pendingApproverRole} is required to decide ${purchaseRequest.requestNo}`)
  }

  const comment = String(req.data.comment || '').trim()
  if (decision === 'Rejected' && !comment) {
    req.reject(400, 'A comment is required when rejecting a purchase request', 'comment')
  }

  await INSERT.into('pr.Approvals').entries({
    request_ID: purchaseRequest.ID,
    approver: req.user.id,
    level: purchaseRequest.currentLevel,
    decision,
    comment,
    decidedAt: new Date()
  })

  if (decision === 'Rejected') {
    await UPDATE('pr.PurchaseRequests').set({
      status: 'Rejected',
      currentLevel: null,
      pendingApproverRole: null
    }).where({ ID: purchaseRequest.ID })
    return readPurchaseRequest(purchaseRequest.ID)
  }

  let chain
  try {
    chain = await loadApprovalChain(purchaseRequest)
  } catch (error) {
    req.reject(error.status || 400, error.message)
  }

  const next = chain.find(rule => Number(rule.level) > Number(purchaseRequest.currentLevel))
  if (next) {
    await UPDATE('pr.PurchaseRequests').set({
      currentLevel: next.level,
      pendingApproverRole: next.approverRole
    }).where({ ID: purchaseRequest.ID })
    return readPurchaseRequest(purchaseRequest.ID)
  }

  await UPDATE('pr.PurchaseRequests').set({
    status: 'Approved',
    pendingApproverRole: null
  }).where({ ID: purchaseRequest.ID })

  const approved = await readPurchaseRequest(purchaseRequest.ID)
  let s4PRNumber
  try {
    s4PRNumber = await createS4PurchaseRequisition(approved)
  } catch (error) {
    req.reject(error.status || 502, `S/4 purchase requisition was not created: ${error.message}`)
  }

  await UPDATE('pr.PurchaseRequests').set({
    status: 'Posted',
    s4PRNumber
  }).where({ ID: purchaseRequest.ID })

  return readPurchaseRequest(purchaseRequest.ID)
}
