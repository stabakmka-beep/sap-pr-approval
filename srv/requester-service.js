const cds = require('@sap/cds')
const { UPDATE } = cds.ql
const { preparePurchaseRequest, validateForSubmit } = require('./lib/validate')
const { readPurchaseRequest, requestId } = require('./lib/purchase-request')
const { loadApprovalChain } = require('./lib/approval-chain')
const { startApprovalFlow } = require('./lib/bpa')
const { netAmount } = require('./lib/amounts')

module.exports = cds.service.impl(function () {
  const { PurchaseRequests } = this.entities
  const targets = [PurchaseRequests, PurchaseRequests.drafts].filter(Boolean)

  this.before(['NEW', 'CREATE', 'UPDATE'], targets, preparePurchaseRequest)
  this.before('SAVE', PurchaseRequests, preparePurchaseRequest)

  this.before(['CREATE', 'UPDATE'], ['Items', 'Items.drafts'], (req) => {
    const amount = netAmount(req.data.quantity, req.data.unitPrice)
    if (amount != null) req.data.netAmount = amount
  })

  this.on('submit', PurchaseRequests.drafts, (req) => {
    req.reject(400, 'Save the purchase request before submitting it')
  })

  this.on('submit', PurchaseRequests, async (req) => {
    const id = requestId(req)
    const purchaseRequest = await readPurchaseRequest(id)
    if (!purchaseRequest) req.reject(404, 'Purchase request not found')
    if (purchaseRequest.requester !== req.user.id) req.reject(403, 'You can only submit your own purchase requests')
    if (!['Draft', 'Rejected'].includes(purchaseRequest.status)) {
      req.reject(409, `Request ${purchaseRequest.requestNo} is ${purchaseRequest.status} and cannot be submitted`)
    }

    validateForSubmit(req, purchaseRequest)
    let chain
    try {
      chain = await loadApprovalChain(purchaseRequest)
    } catch (error) {
      req.reject(error.status || 400, error.message)
    }

    const flow = await startApprovalFlow(purchaseRequest, chain)
    await UPDATE('pr.PurchaseRequests').set({
      status: 'Submitted',
      currentLevel: flow.currentLevel,
      pendingApproverRole: flow.pendingApproverRole,
      s4PRNumber: null
    }).where({ ID: id })

    return present(await readPurchaseRequest(id))
  })

  this.on('withdraw', PurchaseRequests, async (req) => {
    const id = requestId(req)
    const purchaseRequest = await readPurchaseRequest(id)
    if (!purchaseRequest) req.reject(404, 'Purchase request not found')
    if (purchaseRequest.requester !== req.user.id) req.reject(403, 'You can only withdraw your own purchase requests')
    if (purchaseRequest.status !== 'Submitted') {
      req.reject(409, `Only submitted requests can be withdrawn (${purchaseRequest.requestNo} is ${purchaseRequest.status})`)
    }
    if (purchaseRequest.approvals?.length) {
      req.reject(409, `${purchaseRequest.requestNo} already has an approval decision and cannot be withdrawn`)
    }

    await UPDATE('pr.PurchaseRequests').set({
      status: 'Draft',
      currentLevel: null,
      pendingApproverRole: null
    }).where({ ID: id })

    return present(await readPurchaseRequest(id))
  })
})

function present(purchaseRequest) {
  return { ...purchaseRequest, IsActiveEntity: true }
}
