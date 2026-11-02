const cds = require('@sap/cds')
const { assignMockPurchaseRequisitionNumber } = require('./lib/s4-client')

cds.on('bootstrap', (app) => {
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })
})

// The production service is a remote OData client. Locally it is mocked, and
// S/4 normally assigns PurchaseRequisition, so the mock stamps one before insert.
cds.on('served', () => {
  const s4 = cds.services.API_PURCHASEREQ_PROCESS_SRV
  if (!s4 || s4 instanceof cds.RemoteService) return
  s4.before('CREATE', 'A_PurchaseRequisitionHeader', (req) => {
    assignMockPurchaseRequisitionNumber(req.data)
  })
})
