using { pr } from '../db/schema';

/**
 * Approvers see purchase requests waiting on a role they hold.
 * The instance filter (pendingApproverRole) is applied in approver-service.js
 * because it depends on the caller's roles, not a single static role.
 */
@(requires: 'authenticated-user')
@path: 'approver'
service ApproverService {
  @readonly
  entity PurchaseRequests as projection on pr.PurchaseRequests
  where status = 'Submitted'
  actions {
    action approve(comment: String(500) @Common.Label: 'Comment') returns PurchaseRequests;
    action rejectRequest(comment: String(500) @Common.Label: 'Comment') returns PurchaseRequests;
  };

  @readonly entity CompanyCodes   as projection on pr.CompanyCodes;
  @readonly entity Plants         as projection on pr.Plants;
  @readonly entity CostCenters    as projection on pr.CostCenters;
  @readonly entity MaterialGroups as projection on pr.MaterialGroups;
  @readonly entity Units          as projection on pr.Units;
}

annotate ApproverService.PurchaseRequests actions {
  approve @(
    Common.Label: 'Approve',
    Core.OperationAvailable: ($self.status = #Submitted)
  );
  rejectRequest @(
    Common.Label: 'Reject',
    Common.IsActionCritical: true,
    Core.OperationAvailable: ($self.status = #Submitted)
  );
};

annotate ApproverService with @(restrict: [
  { grant: '*', to: ['Approver', 'FinanceApprover'] }
]);
