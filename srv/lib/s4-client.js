const cds = require('@sap/cds')
const { INSERT } = cds.ql
const log = cds.log('s4')

// TODO(S4): replace these constants with determination (material group -> G/L,
// company code -> purchasing organization, a real purchasing group).
const DEFAULT_GL_ACCOUNT = '400000'
const DEFAULT_PURCHASING_GROUP = '001'

let mockSequence = 10000000

function assignMockPurchaseRequisitionNumber(data) {
  if (!data.PurchaseRequisition) {
    mockSequence += 1
    data.PurchaseRequisition = String(mockSequence).padStart(10, '0')
  }
  const number = data.PurchaseRequisition
  for (const item of data.to_PurchaseReqnItem || []) {
    item.PurchaseRequisition = number
    for (const account of item.to_PurchaseReqnAcctAssgmt || []) {
      account.PurchaseRequisition = number
      account.PurchaseRequisitionItem = item.PurchaseRequisitionItem
      if (!account.PurchaseReqnAcctAssgmtNumber) account.PurchaseReqnAcctAssgmtNumber = '01'
    }
  }
  return number
}

function toS4Payload(purchaseRequest) {
  const currency = purchaseRequest.currency_code || purchaseRequest.currency?.code
  const items = (purchaseRequest.items || []).map((item, index) => {
    const itemNumber = String((index + 1) * 10).padStart(5, '0')
    return {
      PurchaseRequisitionItem: itemNumber,
      Material: item.material || undefined,
      PurchaseRequisitionItemText: text(item.shortText || purchaseRequest.description, 40),
      RequestedQuantity: Number(item.quantity),
      BaseUnit: item.unit,
      MaterialGroup: item.materialGroup,
      Plant: purchaseRequest.plant,
      CompanyCode: purchaseRequest.companyCode,
      PurchasingGroup: DEFAULT_PURCHASING_GROUP,
      PurchasingOrganization: purchaseRequest.companyCode,
      DeliveryDate: toS4DateTime(item.deliveryDate),
      PurchaseRequisitionPrice: Number(item.unitPrice),
      PurReqnItemCurrency: currency,
      AccountAssignmentCategory: 'K',
      to_PurchaseReqnAcctAssgmt: [
        {
          PurchaseReqnAcctAssgmtNumber: '01',
          CostCenter: purchaseRequest.costCenter,
          GLAccount: DEFAULT_GL_ACCOUNT,
          Quantity: Number(item.quantity),
          BaseUnit: item.unit
        }
      ]
    }
  })

  return {
    PurchaseRequisitionType: 'NB',
    PurReqnDescription: text(purchaseRequest.description, 40),
    SourceDetermination: false,
    to_PurchaseReqnItem: items
  }
}

/**
 * Create the purchase requisition in S/4 (production destination S4HANA)
 * or in the cds watch mock (development, no credentials).
 * Returns the S/4 purchase requisition number.
 */
async function createS4PurchaseRequisition(purchaseRequest) {
  const s4 = await cds.connect.to('API_PURCHASEREQ_PROCESS_SRV')
  const payload = toS4Payload(purchaseRequest)
  const header = s4.entities.A_PurchaseRequisitionHeader || 'A_PurchaseRequisitionHeader'
  const remote = s4 instanceof cds.RemoteService
  log.info(remote ? 'Posting purchase requisition to S/4' : 'Posting purchase requisition to the mocked S/4 service', {
    requestNo: purchaseRequest.requestNo
  })

  const result = await s4.run(INSERT.into(header).entries(payload))
  const created = Array.isArray(result) ? result[0] : result
  const number = created?.PurchaseRequisition
    || created?.d?.PurchaseRequisition
    || payload.PurchaseRequisition

  if (!number) {
    const error = new Error('S/4 did not return a purchase requisition number')
    error.status = 502
    throw error
  }
  return number
}

function text(value, length) {
  return String(value || '').slice(0, length)
}

function toS4DateTime(value) {
  if (!value) return undefined
  const day = String(value).slice(0, 10)
  return `${day}T00:00:00`
}

module.exports = {
  assignMockPurchaseRequisitionNumber,
  toS4Payload,
  createS4PurchaseRequisition
}
