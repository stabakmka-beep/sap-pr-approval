const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

const OBJECT = 'PurchaseRequest'

/**
 * Next local request number, PR + 8 digits.
 * This is not an S/4 number range. s4PRNumber is assigned by the purchase requisition API.
 */
async function nextRequestNo() {
  const current = await SELECT.one.from('pr.NumberRanges').where({ object: OBJECT })
  const previous = current ? Number(current.currentValue) : 10000000
  const next = previous + 1
  if (current) {
    await UPDATE('pr.NumberRanges').set({ currentValue: next }).where({ object: OBJECT })
  } else {
    await INSERT.into('pr.NumberRanges').entries({ object: OBJECT, currentValue: next })
  }
  return `PR${String(next).padStart(8, '0')}`
}

module.exports = { nextRequestNo }
