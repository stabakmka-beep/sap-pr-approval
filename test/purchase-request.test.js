const cds = require('@sap/cds')
const { GET, POST, DELETE, expect } = cds.test('serve', '--with-mocks', '--in-memory', '--project', __dirname + '/..')

const REQUESTER = '/odata/v4/requester'
const APPROVER = '/odata/v4/approver'
const ADMIN = '/odata/v4/admin'

const as = (username) => ({ auth: { username, password: username } })

function keyOf(row) {
  if (row && Object.hasOwn(row, 'IsActiveEntity')) {
    return `ID=${row.ID},IsActiveEntity=${row.IsActiveEntity}`
  }
  return row.ID
}

function filter(path, expression) {
  return `${path}?$filter=${encodeURIComponent(expression)}`
}

function errorText(error) {
  const body = error.response?.data?.error
  const details = (body?.details || []).map(item => item.message).join(' ')
  return `${error.message || ''} ${body?.message || ''} ${details}`
}

async function expectHttp(promise, status, fragment) {
  try {
    await promise
  } catch (error) {
    expect(error.status).to.equal(status)
    if (fragment) expect(errorText(error)).to.include(fragment)
    return
  }
  throw new Error(`expected HTTP ${status}`)
}

const laptop = (overrides = {}) => ({
  description: 'Test laptops for the project team',
  companyCode: '1000',
  costCenter: 'CC1000',
  plant: '1010',
  currency_code: 'EUR',
  IsActiveEntity: true,
  items: [
    {
      material: 'MAT-100',
      shortText: 'Laptop',
      quantity: 2,
      unit: 'EA',
      unitPrice: 800,
      materialGroup: 'P001',
      deliveryDate: '2026-12-15'
    }
  ],
  ...overrides
})

describe('Purchase request approval', () => {
  it('shows sample requests only to the owning requester', async () => {
    const alice = await GET(`${REQUESTER}/PurchaseRequests`, as('alice'))
    const numbers = alice.data.value.map(row => row.requestNo)
    expect(numbers).to.include('PR10000001')
    expect(numbers).to.include('PR10000002')

    const erin = await GET(`${REQUESTER}/PurchaseRequests`, as('erin'))
    expect(erin.data.value).to.have.length(0)

    await expectHttp(GET(`${REQUESTER}/PurchaseRequests`, as('bob')), 403)
  })

  it('routes submitted requests to the role named on the current level', async () => {
    const bob = await GET(filter(`${APPROVER}/PurchaseRequests`, "requestNo eq 'PR10000002'"), as('bob'))
    expect(bob.data.value).to.have.length(1)
    expect(bob.data.value[0].pendingApproverRole).to.equal('Approver')

    const hidden = await GET(filter(`${APPROVER}/PurchaseRequests`, "requestNo eq 'PR10000004'"), as('bob'))
    expect(hidden.data.value).to.have.length(0)

    const dave = await GET(filter(`${APPROVER}/PurchaseRequests`, "requestNo eq 'PR10000004'"), as('dave'))
    expect(dave.data.value).to.have.length(1)
    expect(dave.data.value[0].currentLevel).to.equal(2)
  })

  it('rejects a save without a cost center, a delivery date, or a positive amount', async () => {
    await expectHttp(
      POST(`${REQUESTER}/PurchaseRequests`, laptop({ costCenter: '' }), as('alice')),
      400,
      'Cost center'
    )
    await expectHttp(
      POST(`${REQUESTER}/PurchaseRequests`, laptop({
        items: [{ ...laptop().items[0], deliveryDate: null }]
      }), as('alice')),
      400,
      'Delivery date'
    )
    await expectHttp(
      POST(`${REQUESTER}/PurchaseRequests`, laptop({
        items: [{ ...laptop().items[0], quantity: 0 }]
      }), as('alice')),
      400,
      'Quantity'
    )
  })

  it('creates, submits, approves, and posts to the mocked S/4 API', async () => {
    const created = await POST(`${REQUESTER}/PurchaseRequests`, laptop(), as('alice'))
    const row = created.data
    expect(row.requester).to.equal('alice')
    expect(row.status).to.equal('Draft')
    expect(/^PR\d{8}$/.test(row.requestNo)).to.equal(true)
    expect(Number(row.totalAmount)).to.equal(1600)
    expect(Number(row.items[0].netAmount)).to.equal(1600)

    const submitted = await POST(`${REQUESTER}/PurchaseRequests(${keyOf(row)})/submit`, {}, as('alice'))
    expect(submitted.data.status).to.equal('Submitted')
    expect(submitted.data.pendingApproverRole).to.equal('Approver')
    expect(submitted.data.currentLevel).to.equal(1)

    await expectHttp(
      POST(`${APPROVER}/PurchaseRequests(${row.ID})/approve`, { comment: 'not my level' }, as('dave')),
      403
    )

    const approved = await POST(
      `${APPROVER}/PurchaseRequests(${row.ID})/approve`,
      { comment: 'Within the cost center budget' },
      as('bob')
    )
    expect(approved.data.status).to.equal('Posted')
    expect(/^\d{10}$/.test(approved.data.s4PRNumber)).to.equal(true)

    const s4 = await cds.connect.to('API_PURCHASEREQ_PROCESS_SRV')
    const { SELECT } = cds.ql
    const header = await s4.run(SELECT.one.from(s4.entities.A_PurchaseRequisitionHeader).where({
      PurchaseRequisition: approved.data.s4PRNumber
    }))
    expect(header.PurchaseRequisitionType).to.equal('NB')
    expect(header.PurReqnDescription).to.equal('Test laptops for the project team')

    const items = await s4.run(SELECT.from(s4.entities.A_PurchaseRequisitionItem).where({
      PurchaseRequisition: approved.data.s4PRNumber
    }))
    expect(items).to.have.length(1)
    expect(items[0].Material).to.equal('MAT-100')
    expect(items[0].Plant).to.equal('1010')

    const accounts = await s4.run(SELECT.from(s4.entities.A_PurReqnAcctAssgmt).where({
      PurchaseRequisition: approved.data.s4PRNumber
    }))
    expect(accounts).to.have.length(1)
    expect(accounts[0].CostCenter).to.equal('CC1000')
  })

  it('advances a second level before posting', async () => {
    const created = await POST(`${REQUESTER}/PurchaseRequests`, laptop({
      description: 'Workshop above the single-approval band',
      items: [{
        material: 'MAT-SRV',
        shortText: 'Workshop',
        quantity: 1,
        unit: 'H',
        unitPrice: 6000,
        materialGroup: 'S001',
        deliveryDate: '2026-12-20'
      }]
    }), as('alice'))

    await POST(`${REQUESTER}/PurchaseRequests(${keyOf(created.data)})/submit`, {}, as('alice'))
    const first = await POST(
      `${APPROVER}/PurchaseRequests(${created.data.ID})/approve`,
      { comment: 'Cost center agrees' },
      as('bob')
    )
    expect(first.data.status).to.equal('Submitted')
    expect(first.data.currentLevel).to.equal(2)
    expect(first.data.pendingApproverRole).to.equal('FinanceApprover')

    const posted = await POST(
      `${APPROVER}/PurchaseRequests(${created.data.ID})/approve`,
      { comment: 'Finance agrees' },
      as('dave')
    )
    expect(posted.data.status).to.equal('Posted')
    expect(/^\d{10}$/.test(posted.data.s4PRNumber)).to.equal(true)
  })

  it('records a rejection and lets the requester withdraw an untouched submission', async () => {
    const rejectedSource = await POST(`${REQUESTER}/PurchaseRequests`, laptop({
      description: 'Chairs to reject',
      items: [{ ...laptop().items[0], quantity: 1, unitPrice: 300 }]
    }), as('alice'))
    await POST(`${REQUESTER}/PurchaseRequests(${keyOf(rejectedSource.data)})/submit`, {}, as('alice'))
    await expectHttp(
      POST(`${APPROVER}/PurchaseRequests(${rejectedSource.data.ID})/rejectRequest`, {}, as('bob')),
      400,
      'comment'
    )
    const rejected = await POST(
      `${APPROVER}/PurchaseRequests(${rejectedSource.data.ID})/rejectRequest`,
      { comment: 'Use the frame contract' },
      as('bob')
    )
    expect(rejected.data.status).to.equal('Rejected')

    const withdrawnSource = await POST(`${REQUESTER}/PurchaseRequests`, laptop({
      description: 'Request to withdraw'
    }), as('alice'))
    await POST(`${REQUESTER}/PurchaseRequests(${keyOf(withdrawnSource.data)})/submit`, {}, as('alice'))
    const withdrawn = await POST(
      `${REQUESTER}/PurchaseRequests(${keyOf(withdrawnSource.data)})/withdraw`,
      {},
      as('alice')
    )
    expect(withdrawn.data.status).to.equal('Draft')
    expect(withdrawn.data.pendingApproverRole == null || withdrawn.data.pendingApproverRole === '').to.equal(true)
  })

  it('opens an empty Fiori draft, activates a complete one, and submits it', async () => {
    const empty = await POST(`${REQUESTER}/PurchaseRequests`, { IsActiveEntity: false }, as('alice'))
    expect(empty.data.IsActiveEntity).to.equal(false)
    expect(/^PR\d{8}$/.test(empty.data.requestNo)).to.equal(true)

    const draft = await POST(`${REQUESTER}/PurchaseRequests`, {
      ...laptop(),
      description: 'Created the way Fiori elements does',
      IsActiveEntity: false
    }, as('alice'))
    const activated = await POST(
      `${REQUESTER}/PurchaseRequests(${keyOf(draft.data)})/draftActivate`,
      {},
      as('alice')
    )
    expect(activated.data.IsActiveEntity).to.equal(true)
    expect(Number(activated.data.totalAmount)).to.equal(1600)
    const submitted = await POST(
      `${REQUESTER}/PurchaseRequests(${keyOf(activated.data)})/submit`,
      {},
      as('alice')
    )
    expect(submitted.data.status).to.equal('Submitted')
  })

  it('lets an admin maintain approval rules and keeps requesters out', async () => {
    await expectHttp(GET(`${ADMIN}/ApprovalRules`, as('alice')), 403)
    const created = await POST(`${ADMIN}/ApprovalRules`, {
      companyCode: '9999',
      minAmount: 0,
      maxAmount: 10,
      level: 1,
      approverRole: 'Approver'
    }, as('carol'))
    expect(created.status).to.equal(201)
    await DELETE(`${ADMIN}/ApprovalRules(${created.data.ID})`, as('carol'))
  })
})
