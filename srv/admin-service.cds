using { pr } from '../db/schema';

/** Maintain approval rules. Purchase requests are exposed read-only for support. */
@(requires: 'Admin')
@path: 'admin'
service AdminService {
  entity ApprovalRules as projection on pr.ApprovalRules;

  @readonly
  entity PurchaseRequests as projection on pr.PurchaseRequests;

  @readonly entity CompanyCodes  as projection on pr.CompanyCodes;
  @readonly entity Plants        as projection on pr.Plants;
  @readonly entity CostCenters   as projection on pr.CostCenters;
  @readonly entity ApproverRoles as projection on pr.ApproverRoles;
}
