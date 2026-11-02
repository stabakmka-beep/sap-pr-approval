const cds = require('@sap/cds')
const log = cds.log('bpa')

/**
 * BPA_HOOK
 * --------
 * In-app approval is the default. To hand the chain to SAP Build Process Automation:
 *
 * 1. Build a process whose approval steps follow `chain` (role per level).
 * 2. Create a destination BUILD_PROCESS_AUTOMATION (OAuth2 client credentials
 *    to the SPA / workflow runtime).
 * 3. Set BPA_ENABLED=true on the CAP service (mta.yaml property or cf set-env).
 * 4. Replace the body of startBuildProcessAutomation() with a POST, for example:
 *
 *      const bpa = await cds.connect.to('BuildProcessAutomation')
 *      await bpa.send({
 *        method: 'POST',
 *        path: '/workflow/rest/v1/workflow-instances',
 *        data: {
 *          definitionId: process.env.BPA_DEFINITION_ID,
 *          context: { purchaseRequest, chain }
 *        }
 *      })
 *
 * 5. Point the process decisions at ApproverService.approve / rejectRequest
 *    (technical user with the matching role) or add a callback action.
 * 6. Return true from the stub once the process instance exists, and persist
 *    its id if you add a column for it. Returning false keeps the in-app flow
 *    so a half-wired destination never drops a request.
 */
async function startApprovalFlow(purchaseRequest, chain) {
  const first = chain[0]
  if (process.env.BPA_ENABLED === 'true') {
    const delegated = await startBuildProcessAutomation(purchaseRequest, chain)
    if (delegated) {
      return {
        delegated: true,
        currentLevel: first.level,
        pendingApproverRole: first.approverRole
      }
    }
  }
  return {
    delegated: false,
    currentLevel: first.level,
    pendingApproverRole: first.approverRole
  }
}

async function startBuildProcessAutomation(purchaseRequest, chain) {
  log.warn(
    `BPA_ENABLED is set, but the process trigger is still a stub. ${purchaseRequest.requestNo} stays in the in-app flow (${chain.length} level(s)).`
  )
  // TODO(BPA): POST the workflow instance and return true.
  return false
}

module.exports = { startApprovalFlow }
