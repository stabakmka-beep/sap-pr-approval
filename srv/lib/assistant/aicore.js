const cds = require('@sap/cds')
const fs = require('fs')
const path = require('path')
const { TOOL_DEFINITIONS, executeTool, summarize } = require('./tools')

const SYSTEM = `You are the Approval Assistant inside a purchase-request app.
Use the tools to answer. Only describe requests the tools return.
list_pending and get_request are read-only.
propose_approve and propose_reject do not change any request. They only prepare a confirmation the user must accept in the app.
Never say a request was approved or rejected unless a tool result says so.
Amounts are in the currency the tool returns.`

function modelName() {
  return process.env.AICORE_MODEL || cds.env.requires?.aicore?.model || 'gpt-4o'
}

function resourceGroup() {
  return process.env.AICORE_RESOURCE_GROUP || cds.env.requires?.aicore?.resourceGroup || 'default'
}

function destinationName() {
  return process.env.AICORE_DESTINATION || cds.env.requires?.aicore?.destination || ''
}

function bindingPresent(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (value.aicore) return bindingPresent(value.aicore)
  if (value.credentials) return Boolean(value.credentials.clientid || value.credentials.clientId || value.credentials.serviceurls || value.credentials.url)
  return Boolean(value.clientid || value.clientId || value.serviceurls || value.url)
}

function aiCoreBound() {
  if (process.env.ASSISTANT_LLM === 'mock') return false
  if (process.env.ASSISTANT_LLM === 'aicore') return true
  if (process.env.AICORE_SERVICE_KEY) return true
  try {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}')
    if (bindingPresent(vcap.aicore)) return true
  } catch { /* not JSON */ }
  if (bindingPresent(cds.env.requires?.aicore?.credentials)) return true
  for (const file of ['default-env.json', '.cdsrc-private.json']) {
    const full = path.join(cds.root, file)
    if (!fs.existsSync(full)) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
      if (bindingPresent(parsed.VCAP_SERVICES?.aicore) || bindingPresent(parsed.requires?.aicore)) return true
    } catch { /* ignore unreadable local binding */ }
  }
  return false
}

function toReply(result, model) {
  return {
    reply: result.reply || result.error || 'I could not answer that.',
    confirmationRequired: Boolean(result.confirmationRequired),
    confirmToken: result.confirmToken || null,
    proposedAction: result.proposedAction || null,
    requestNo: result.requestNo || null,
    model
  }
}

async function completeWithTools({ messages, user }) {
  const { OrchestrationClient } = await import('@sap-ai-sdk/orchestration')
  const destination = destinationName() ? { destinationName: destinationName() } : undefined
  const client = new OrchestrationClient({
    promptTemplating: {
      model: { name: modelName() },
      prompt: { tools: TOOL_DEFINITIONS }
    }
  }, { resourceGroup: resourceGroup() }, destination)

  let response = await client.chatCompletion({ messages })
  for (let step = 0; step < 4; step++) {
    const assistant = response.getAssistantMessage?.()
    const calls = assistant?.tool_calls || []
    if (!calls.length) {
      return toReply({ reply: response.getContent?.() || '' }, modelName())
    }
    const toolMessages = []
    let proposal = null
    for (const call of calls) {
      let args = {}
      try { args = JSON.parse(call.function?.arguments || '{}') } catch { args = {} }
      const result = await executeTool(call.function?.name, args, user)
      if (result?.confirmationRequired) proposal = result
      const spoken = result?.confirmationRequired ? result : summarize(result)
      toolMessages.push({
        role: 'tool',
        content: JSON.stringify(spoken),
        tool_call_id: call.id
      })
    }
    if (proposal) return toReply(proposal, modelName())
    response = await client.chatCompletion({
      messages: toolMessages,
      messagesHistory: response.getAllMessages()
    })
  }
  return toReply({ reply: response.getContent?.() || 'I could not finish that.' }, modelName())
}

module.exports = { aiCoreBound, modelName, completeWithTools, SYSTEM, toReply }
