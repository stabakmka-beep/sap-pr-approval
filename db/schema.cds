using { cuid, managed, Currency } from '@sap/cds/common';
using { Attachments } from '@cap-js/attachments';

namespace pr;

type RequestStatus : String enum {
  Draft;
  Submitted;
  Approved;
  Rejected;
  Posted;
}

type ApprovalDecision : String enum {
  Approved;
  Rejected;
}

/**
 * Purchase request header. totalAmount is persisted and recomputed by
 * RequesterService from item net amounts. Workflow columns (status,
 * currentLevel, pendingApproverRole, s4PRNumber) are owned by the services.
 */
entity PurchaseRequests : cuid, managed {
  requestNo           : String(12);
  description         : String(120);
  @cds.on.insert: $user
  requester           : String(100);
  costCenter          : String(10);
  companyCode         : String(4);
  plant               : String(4);
  currency            : Currency;
  totalAmount         : Decimal(15, 2) default 0;
  status              : RequestStatus default 'Draft';
  /** Purchase requisition number returned by API_PURCHASEREQ_PROCESS_SRV. */
  s4PRNumber          : String(10);
  /** Level currently waiting for a decision. Empty until submit. */
  currentLevel        : Integer;
  /** XSUAA role that may decide the current level. Matched to ApprovalRules.approverRole. */
  pendingApproverRole : String(40);
  items               : Composition of many Items on items.request = $self;
  approvals           : Composition of many Approvals on approvals.request = $self;
  /** Supplier quotes. Stored in the database locally and on HANA; see README to move them to Object Store. */
  @Validation.MaxItems: 10
  attachments         : Composition of many Attachments;
  @Core.Computed
  @UI.Hidden
  statusCriticality   : Integer = (
    status = #Draft     ? 0 :
    status = #Submitted ? 2 :
    status = #Approved  ? 3 :
    status = #Rejected  ? 1 :
    status = #Posted    ? 3 : 0
  );
}

annotate PurchaseRequests.attachments with {
  content @Validation.Maximum: '15MB'
          @Core.AcceptableMediaTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ];
};

entity Items : cuid {
  request       : Association to PurchaseRequests;
  material      : String(40);
  shortText     : String(40);
  quantity      : Decimal(13, 3);
  unit          : String(3);
  unitPrice     : Decimal(15, 2);
  /** quantity * unitPrice, written by RequesterService. */
  netAmount     : Decimal(15, 2);
  materialGroup : String(9);
  deliveryDate  : Date;
  /** Header currency, so item amounts do not $expand the parent in the object page. */
  @UI.Hidden
  @Core.Computed
  currencyCode  : String = request.currency.code;
}

/** One row per decision. History is kept across resubmit. */
entity Approvals : cuid {
  request   : Association to PurchaseRequests;
  approver  : String(100);
  level     : Integer;
  decision  : ApprovalDecision;
  comment   : String(500);
  decidedAt : Timestamp;
}

/**
 * Who must approve, by company code, optional cost center, and amount band.
 * A blank cost center matches every cost center. A blank maxAmount has no upper bound.
 * More specific rules (cost center filled) win over generic ones at the same level.
 */
entity ApprovalRules : cuid, managed {
  companyCode  : String(4);
  costCenter   : String(10);
  minAmount    : Decimal(15, 2);
  maxAmount    : Decimal(15, 2);
  level        : Integer;
  approverRole : String(40);
}

/** Local number range. Next request number is PR + 8 digits. */
entity NumberRanges {
  key object     : String(40);
  currentValue   : Integer;
}

@cds.autoexpose
@readonly
entity CompanyCodes {
  key code : String(4);
  name     : String(80);
}

@cds.autoexpose
@readonly
entity Plants {
  key code        : String(4);
  name            : String(80);
  companyCode     : String(4);
}

@cds.autoexpose
@readonly
entity CostCenters {
  key code        : String(10);
  name            : String(80);
  companyCode     : String(4);
}

@cds.autoexpose
@readonly
entity MaterialGroups {
  key code : String(9);
  name     : String(80);
}

@cds.autoexpose
@readonly
entity Units {
  key code : String(3);
  name     : String(40);
}

@cds.autoexpose
@readonly
entity ApproverRoles {
  key role : String(40);
  name     : String(80);
}
