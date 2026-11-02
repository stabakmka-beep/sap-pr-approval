const cds = require('@sap/cds')
const { SELECT } = cds.ql

function text(value) {
  return value == null ? '' : String(value).trim()
}

/**
 * Build the ordered approval chain for a purchase request.
 * Rules match on company code, optional cost center, and the amount band.
 * At a given level, a cost-center-specific rule replaces generic rules.
 * Two surviving rules at the same level is a configuration error.
 */
function selectChain(rules, purchaseRequest) {
  const amount = Number(purchaseRequest.totalAmount || 0)
  const companyCode = text(purchaseRequest.companyCode)
  const costCenter = text(purchaseRequest.costCenter)

  const matching = rules.filter(rule => {
    if (text(rule.companyCode) !== companyCode) return false
    const ruleCostCenter = text(rule.costCenter)
    if (ruleCostCenter && ruleCostCenter !== costCenter) return false
    if (amount < Number(rule.minAmount || 0)) return false
    if (rule.maxAmount != null && rule.maxAmount !== '' && amount > Number(rule.maxAmount)) return false
    return true
  })

  const byLevel = new Map()
  for (const rule of matching) {
    const level = Number(rule.level)
    const list = byLevel.get(level) || []
    list.push(rule)
    byLevel.set(level, list)
  }

  const chain = []
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const candidates = byLevel.get(level)
    const specific = candidates.filter(rule => text(rule.costCenter))
    const pool = specific.length ? specific : candidates
    if (pool.length > 1) {
      const error = new Error(
        `Ambiguous approval rules for company ${companyCode}, cost center ${costCenter || '(any)'}, level ${level}. Keep one rule per level.`
      )
      error.status = 409
      throw error
    }
    chain.push(pool[0])
  }

  if (!chain.length) {
    const error = new Error(
      `No approval rule matches company code ${companyCode || '(missing)'}, cost center ${costCenter || '(missing)'}, and amount ${amount}.`
    )
    error.status = 400
    throw error
  }

  return chain
}

async function loadApprovalChain(purchaseRequest) {
  const rules = await SELECT.from('pr.ApprovalRules')
  return selectChain(rules, purchaseRequest)
}

module.exports = { selectChain, loadApprovalChain }
