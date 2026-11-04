const cds = require('@sap/cds')
const { GET, POST, expect } = cds.test('serve', '--with-mocks', '--in-memory', '--project', __dirname + '/..')

const REQUESTER = '/odata/v4/requester'
const ASSISTANT = '/odata/v4/assistant'

const as = (username) => ({ auth: { username, password: username } })

function errorText(error) {
  const body = error.response?.data?.error
  return `${error.message || ''} ${body?.message || ''}`
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

async function chat(user, message) {
  const response = await POST(`${ASSISTANT}/chat`, { message, history: '[]' }, as(user))
  return response.data
}

async function confirm(user, token) {
  const response = await POST(`${ASSISTANT}/confirm`, { token }, as(user))
  return response.data
}

async function statusOf(requestNo) {
  const response = await GET(
    `${REQUESTER}/PurchaseRequests?$filter=${encodeURIComponent(`requestNo eq '${requestNo}'`)}`,
    as('alice')
  )
  return response.data.value[0]
}

const laptop = (overrides = {}) => ({
  description: 'Assistant test laptops',
  companyCode: '1000',
  costCenter: 'CC1000',
  plant: '1010',
  currency_code: 'EUR',
  IsActiveEntity: true,
  items: [{
    material: 'MAT-100',
    shortText: 'Laptop',
    quantity: 1,
    unit: 'EA',
    unitPrice: 900,
    materialGroup: 'P001',
    deliveryDate: '2026-12-15'
  }],
  ...overrides
})

async function submitNew(overrides) {
  const created = await POST(`${REQUESTER}/PurchaseRequests`, laptop(overrides), as('alice'))
  await POST(`${REQUESTER}/PurchaseRequests(ID=${created.data.ID},IsActiveEntity=true)/submit`, {}, as('alice'))
  return created.data
}

describe('Approval assistant', () => {
  it('answers inbox questions from sample data without changing them', async () => {
    const bobOver = await chat('bob', "What's waiting for me over $5K?")
    expect(bobOver.model).to.equal('mock')
    expect(bobOver.confirmationRequired).to.equal(false)
    expect(bobOver.reply).to.not.include('PR10000002')
    expect(bobOver.reply).to.not.include('PR10000004')

    const daveOver = await chat('dave', "What's waiting for me over $5K?")
    expect(daveOver.reply).to.include('PR10000004')
    expect(daveOver.reply).to.include('8,000.00')

    const it = await chat('bob', 'Which requests from IT are pending?')
    expect(it.reply).to.include('PR10000002')
    expect(it.reply).to.include('IT Operations')
    expect(it.reply).to.not.include('PR10000004')

    const summary = await chat('bob', 'Summarize PR10000002')
    expect(summary.reply).to.include('Docking stations')
    expect(summary.reply).to.include('alice')
    expect(summary.requestNo).to.equal('PR10000002')

    expect((await statusOf('PR10000002')).status).to.equal('Submitted')
    expect((await statusOf('PR10000004')).status).to.equal('Submitted')
  })

  it('refuses a requester and waits for confirmation before approve', async () => {
    const created = await submitNew()
    const refused = await chat('alice', `Approve ${created.requestNo}`)
    expect(refused.confirmationRequired).to.equal(false)
    expect(refused.confirmToken || '').to.equal('')
    expect(refused.reply).to.match(/can't approve/i)
    expect((await statusOf(created.requestNo)).status).to.equal('Submitted')

    const proposed = await chat('bob', `Approve ${created.requestNo}`)
    expect(proposed.confirmationRequired).to.equal(true)
    expect(proposed.proposedAction).to.equal('approve')
    expect(proposed.confirmToken).to.be.a('string').and.not.empty
    expect((await statusOf(created.requestNo)).status).to.equal('Submitted')

    await expectHttp(confirm('alice', proposed.confirmToken), 403, 'different user')
    expect((await statusOf(created.requestNo)).status).to.equal('Submitted')

    const decided = await confirm('bob', proposed.confirmToken)
    expect(decided.reply).to.include(created.requestNo)
    expect((await statusOf(created.requestNo)).status).to.equal('Posted')

    await expectHttp(confirm('bob', proposed.confirmToken), 400, 'already used')
  })

  it('requires a comment and a confirmation before reject', async () => {
    const created = await submitNew({
      description: 'Assistant test reject',
      items: [{ ...laptop().items[0], unitPrice: 300 }]
    })

    const missing = await chat('bob', `Reject ${created.requestNo}`)
    expect(missing.confirmationRequired).to.equal(false)
    expect(missing.reply).to.match(/comment/i)
    expect((await statusOf(created.requestNo)).status).to.equal('Submitted')

    const proposed = await chat('bob', `Reject ${created.requestNo} because the price is high`)
    expect(proposed.confirmationRequired).to.equal(true)
    expect(proposed.proposedAction).to.equal('reject')
    expect((await statusOf(created.requestNo)).status).to.equal('Submitted')

    const decided = await confirm('bob', proposed.confirmToken)
    expect(decided.reply).to.include('Rejected')
    expect((await statusOf(created.requestNo)).status).to.equal('Rejected')
  })

  it('hides another approver\'s request', async () => {
    const hidden = await chat('bob', 'Summarize PR10000004')
    expect(hidden.confirmationRequired).to.equal(false)
    expect(hidden.reply).to.match(/can't see/i)
  })
})
