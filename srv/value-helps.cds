using { pr } from '../db/schema';

annotate pr.PurchaseRequests with {
  requestNo           @Common.Label: 'Request';
  description         @Common.Label: 'Description';
  requester           @Common.Label: 'Requester'           @Common.FieldControl: #ReadOnly;
  companyCode         @Common.Label: 'Company code'        @Common.ValueList: {
    Label: 'Company codes',
    CollectionPath: 'CompanyCodes',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: companyCode, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  costCenter          @Common.Label: 'Cost center'        @Common.ValueList: {
    Label: 'Cost centers',
    CollectionPath: 'CostCenters',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: costCenter, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterIn', LocalDataProperty: companyCode, ValueListProperty: 'companyCode' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  plant               @Common.Label: 'Plant'              @Common.ValueList: {
    Label: 'Plants',
    CollectionPath: 'Plants',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: plant, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterIn', LocalDataProperty: companyCode, ValueListProperty: 'companyCode' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  currency            @Common.Label: 'Currency';
  totalAmount         @Common.Label: 'Total'              @Common.FieldControl: #ReadOnly @Measures.ISOCurrency: currency_code;
  status              @Common.Label: 'Status'             @Common.FieldControl: #ReadOnly;
  s4PRNumber          @Common.Label: 'S/4 requisition'    @Common.FieldControl: #ReadOnly;
  currentLevel        @Common.Label: 'Approval level'     @Common.FieldControl: #ReadOnly @UI.Hidden;
  pendingApproverRole @Common.Label: 'Pending role'       @Common.FieldControl: #ReadOnly;
  items               @Common.Label: 'Items';
  approvals           @Common.Label: 'Approval history'   @Common.FieldControl: #ReadOnly;
  attachments         @Common.Label: 'Supplier quotes';
};

annotate pr.Items with {
  material      @Common.Label: 'Material';
  shortText     @Common.Label: 'Short text';
  quantity      @Common.Label: 'Quantity';
  unit          @Common.Label: 'Unit' @Common.ValueList: {
    Label: 'Units',
    CollectionPath: 'Units',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: unit, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  unitPrice     @Common.Label: 'Unit price'  @Measures.ISOCurrency: currencyCode;
  netAmount     @Common.Label: 'Net amount'  @Common.FieldControl: #ReadOnly @Measures.ISOCurrency: currencyCode;
  materialGroup @Common.Label: 'Material group' @Common.ValueList: {
    Label: 'Material groups',
    CollectionPath: 'MaterialGroups',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: materialGroup, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  deliveryDate  @Common.Label: 'Delivery date';
};

annotate pr.Approvals with {
  approver  @Common.Label: 'Approver'  @Common.FieldControl: #ReadOnly;
  level     @Common.Label: 'Level'     @Common.FieldControl: #ReadOnly;
  decision  @Common.Label: 'Decision'  @Common.FieldControl: #ReadOnly;
  comment   @Common.Label: 'Comment'   @Common.FieldControl: #ReadOnly;
  decidedAt @Common.Label: 'Decided at' @Common.FieldControl: #ReadOnly;
};

annotate pr.ApprovalRules with {
  companyCode  @Common.Label: 'Company code' @Common.ValueList: {
    Label: 'Company codes',
    CollectionPath: 'CompanyCodes',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: companyCode, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  costCenter   @Common.Label: 'Cost center' @Common.ValueList: {
    Label: 'Cost centers',
    CollectionPath: 'CostCenters',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: costCenter, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterIn', LocalDataProperty: companyCode, ValueListProperty: 'companyCode' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
  minAmount    @Common.Label: 'Minimum amount';
  maxAmount    @Common.Label: 'Maximum amount';
  level        @Common.Label: 'Level';
  approverRole @Common.Label: 'Approver role' @Common.ValueList: {
    Label: 'Approver roles',
    CollectionPath: 'ApproverRoles',
    Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: approverRole, ValueListProperty: 'role' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]
  };
};
