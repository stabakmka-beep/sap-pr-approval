using { pr } from '../db/schema';

/**
 * Requesters create and submit their own purchase requests.
 * Draft is enabled so the Fiori elements object page can edit line by line.
 * Direct POST/PATCH of active documents also works (cds.fiori.bypass_draft).
 */
@(requires: 'Requester')
@path: 'requester'
service RequesterService {
  @odata.draft.enabled
  @Common.SemanticKey: [requestNo]
  entity PurchaseRequests as projection on pr.PurchaseRequests
  actions {
    action submit() returns PurchaseRequests;
    action withdraw() returns PurchaseRequests;
  };

  @readonly entity CompanyCodes    as projection on pr.CompanyCodes;
  @readonly entity Plants          as projection on pr.Plants;
  @readonly entity CostCenters     as projection on pr.CostCenters;
  @readonly entity MaterialGroups  as projection on pr.MaterialGroups;
  @readonly entity Units           as projection on pr.Units;
}

annotate RequesterService.PurchaseRequests actions {
  submit @(
    Common.Label: 'Submit',
    Core.OperationAvailable: ($self.status = #Draft or $self.status = #Rejected)
  );
  withdraw @(
    Common.Label: 'Withdraw',
    Core.OperationAvailable: ($self.status = #Submitted)
  );
};

annotate RequesterService.PurchaseRequests with @(restrict: [
  { grant: 'READ', to: 'Requester', where: 'requester = $user' },
  { grant: 'CREATE', to: 'Requester' },
  { grant: ['UPDATE', 'DELETE'], to: 'Requester', where: 'requester = $user and (status = ''Draft'' or status = ''Rejected'')' },
  { grant: 'submit', to: 'Requester', where: 'requester = $user and (status = ''Draft'' or status = ''Rejected'')' },
  { grant: 'withdraw', to: 'Requester', where: 'requester = $user and status = ''Submitted''' }
]);

annotate RequesterService.PurchaseRequests with @(
  Capabilities.UpdateRestrictions: {
    Updatable: (status = #Draft or status = #Rejected)
  },
  Capabilities.DeleteRestrictions: {
    Deletable: (status = #Draft)
  }
);
