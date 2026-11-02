/** Money helpers. Amounts are stored as decimals with 2 fraction digits. */

function round2(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.round((number + Number.EPSILON) * 100) / 100
}

function netAmount(quantity, unitPrice) {
  if (quantity == null || unitPrice == null) return null
  if (!Number.isFinite(Number(quantity)) || !Number.isFinite(Number(unitPrice))) return null
  return round2(Number(quantity) * Number(unitPrice))
}

function totalOf(items = []) {
  return round2(items.reduce((sum, item) => sum + Number(item.netAmount || 0), 0))
}

module.exports = { round2, netAmount, totalOf }
