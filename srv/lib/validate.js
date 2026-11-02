const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { netAmount, totalOf } = require('./amounts')
const { nextRequestNo } = require('./number-range')

const PROTECTED = ['status', 's4PRNumber', 'currentLevel', 'pendingApproverRole', 'requester', 'requestNo', 'totalAmount']

function blank(value) {
  return value == null || String(value).trim() === ''
}

/**
 * Strip client control of workflow fields, recompute amounts, and validate.
 * Empty NEW (Fiori "create" before the user has typed) is not validated.
 * SAVE (draft activation) and a completed NEW/CREATE/UPDATE are.
 */
async function preparePurchaseRequest(req) {
  const creating = req.event === 'NEW' || req.event === 'CREATE'
  if (creating) {
    delete req.data.approvals
    req.data.requester = req.user.id
    req.data.status = 'Draft'
    req.data.s4PRNumber = null
    req.data.currentLevel = null
    req.data.pendingApproverRole = null
    if (!req.data.requestNo) req.data.requestNo = await nextRequestNo()
  } else {
    for (const field of PROTECTED) delete req.data[field]
    if ('approvals' in req.data) {
      const id = req.data.ID
      req.data.approvals = id
        ? await SELECT.from('pr.Approvals').where({ request_ID: id })
        : []
    }
  }

  const items = req.data.items
  if (Array.isArray(items)) {
    for (const item of items) {
      const amount = netAmount(item.quantity, item.unitPrice)
      if (amount != null) item.netAmount = amount
    }
    req.data.totalAmount = totalOf(items)
  }

  if (creating && isEmpty(req.data)) return

  const document = await merged(req)
  validateForSave(req, document)
  if (req.errors?.length) req.reject()
}

function validateForSave(req, document) {
  if (blank(document.costCenter)) {
    req.error(400, 'Cost center is required', 'costCenter')
  }
  const items = document.items || []
  items.forEach((item, index) => validateItem(req, item, index))
}

function validateForSubmit(req, document) {
  validateForSave(req, document)
  if (blank(document.description)) req.error(400, 'Description is required', 'description')
  if (blank(document.companyCode)) req.error(400, 'Company code is required', 'companyCode')
  if (blank(document.plant)) req.error(400, 'Plant is required', 'plant')
  if (blank(document.currency_code) && blank(document.currency?.code)) {
    req.error(400, 'Currency is required', 'currency_code')
  }
  if (!document.items?.length) req.error(400, 'Add at least one item before submitting', 'items')
  if (!(Number(document.totalAmount) > 0)) req.error(400, 'Total amount must be greater than zero', 'totalAmount')
  if (req.errors?.length) req.reject()
}

function validateItem(req, item, index) {
  const at = (field) => `items/${index}/${field}`
  if (blank(item.shortText) && blank(item.material)) {
    req.error(400, 'Item short text or material is required', at('shortText'))
  }
  if (!(Number(item.quantity) > 0)) req.error(400, 'Quantity must be greater than zero', at('quantity'))
  if (!(Number(item.unitPrice) > 0)) req.error(400, 'Unit price must be greater than zero', at('unitPrice'))
  if (blank(item.unit)) req.error(400, 'Unit is required', at('unit'))
  if (blank(item.deliveryDate)) req.error(400, 'Delivery date is required', at('deliveryDate'))
  if (blank(item.materialGroup)) req.error(400, 'Material group is required', at('materialGroup'))
}

function isEmpty(data) {
  const keys = ['description', 'costCenter', 'companyCode', 'plant', 'currency_code']
  if (keys.some(key => !blank(data[key]))) return false
  return !(Array.isArray(data.items) && data.items.length)
}

async function merged(req) {
  if (req.event !== 'UPDATE' && req.event !== 'SAVE') return req.data
  const id = req.data.ID || req.params?.[0]?.ID || req.params?.[0]
  if (!id) return req.data
  const current = await SELECT.one.from(req.subject || 'pr.PurchaseRequests').where({ ID: id })
    || await SELECT.one.from('pr.PurchaseRequests').where({ ID: id })
  const items = Array.isArray(req.data.items) ? req.data.items : current?.items
  return { ...(current || {}), ...req.data, items }
}

module.exports = { blank, preparePurchaseRequest, validateForSave, validateForSubmit }
