const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { blank } = require('./lib/validate')

module.exports = cds.service.impl(function () {
  this.before(['CREATE', 'UPDATE'], 'ApprovalRules', async (req) => {
    const current = req.event === 'UPDATE'
      ? await SELECT.one.from(req.subject).where({ ID: req.data.ID })
      : {}
    const rule = { ...(current || {}), ...req.data }

    if (blank(rule.companyCode)) req.error(400, 'Company code is required', 'companyCode')
    if (blank(rule.approverRole)) req.error(400, 'Approver role is required', 'approverRole')
    if (!(Number(rule.level) >= 1)) req.error(400, 'Level must be 1 or greater', 'level')
    if (rule.minAmount == null || Number(rule.minAmount) < 0) {
      req.error(400, 'Minimum amount must be zero or greater', 'minAmount')
    }
    if (rule.maxAmount != null && rule.maxAmount !== '' && Number(rule.maxAmount) < Number(rule.minAmount)) {
      req.error(400, 'Maximum amount must be greater than or equal to the minimum', 'maxAmount')
    }
    if (req.errors?.length) req.reject()
  })
})
