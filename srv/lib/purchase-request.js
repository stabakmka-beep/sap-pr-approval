const cds = require('@sap/cds')
const { SELECT } = cds.ql

function requestId(req) {
  const key = req.params?.[0]
  if (key && typeof key === 'object') return key.ID || key.id
  return key
}

async function readPurchaseRequest(id) {
  return SELECT.one.from('pr.PurchaseRequests', id).columns(purchaseRequest => {
    purchaseRequest('*')
    purchaseRequest.items(item => { item('*') })
    purchaseRequest.approvals(approval => { approval('*') })
  })
}

function callerRoles(user) {
  return Object.keys(user?.roles || {}).filter(role => user.roles[role])
}

module.exports = { requestId, readPurchaseRequest, callerRoles }
