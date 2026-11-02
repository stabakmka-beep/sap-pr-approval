using RequesterService as service from '../../srv/requester-service';

annotate service.PurchaseRequests with @(
  UI.HeaderInfo: {
    TypeName: 'Purchase request',
    TypeNamePlural: 'Purchase requests',
    TypeImageUrl: 'sap-icon://request',
    Title: { Value: requestNo },
    Description: { Value: description }
  },
  UI.SelectionFields: [
    requestNo,
    status,
    companyCode,
    costCenter,
    totalAmount
  ],
  UI.LineItem: [
    { Value: requestNo },
    { Value: description },
    { Value: companyCode },
    { Value: costCenter },
    { Value: totalAmount },
    { Value: currency_code, Label: 'Currency' },
    {
      Value: status,
      Criticality: statusCriticality,
      CriticalityRepresentation: #WithIcon
    },
    { Value: s4PRNumber },
    { Value: modifiedAt },
    { $Type: 'UI.DataFieldForAction', Action: 'RequesterService.submit', Label: 'Submit' },
    { $Type: 'UI.DataFieldForAction', Action: 'RequesterService.withdraw', Label: 'Withdraw' }
  ],
  UI.Identification: [
    { Value: requestNo },
    { Value: description },
    { $Type: 'UI.DataFieldForAction', Action: 'RequesterService.submit', Label: 'Submit', Determining: true },
    { $Type: 'UI.DataFieldForAction', Action: 'RequesterService.withdraw', Label: 'Withdraw', Determining: true }
  ],
  UI.FieldGroup #General: {
    Label: 'General',
    Data: [
      { Value: description },
      { Value: requester },
      { Value: companyCode },
      { Value: costCenter },
      { Value: plant },
      { Value: currency_code, Label: 'Currency' },
      { Value: totalAmount },
      {
        Value: status,
        Criticality: statusCriticality,
        CriticalityRepresentation: #WithIcon
      },
      { Value: pendingApproverRole },
      { Value: s4PRNumber }
    ]
  },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'General', Label: 'General', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Items', Label: 'Items', Target: 'items/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Approvals', Label: 'Approval history', Target: 'approvals/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'SupplierQuotes', Label: 'Supplier quotes', Target: 'attachments/@UI.LineItem' }
  ],
  UI.PresentationVariant: {
    SortOrder: [{ Property: modifiedAt, Descending: true }],
    Visualizations: ['@UI.LineItem']
  }
);

annotate service.Items with @(
  UI.HeaderInfo: {
    TypeName: 'Item',
    TypeNamePlural: 'Items',
    Title: { Value: shortText }
  },
  UI.LineItem: [
    { Value: material },
    { Value: shortText },
    { Value: quantity },
    { Value: unit },
    { Value: unitPrice },
    { Value: netAmount },
    { Value: materialGroup },
    { Value: deliveryDate }
  ],
  UI.Identification: [
    { Value: material },
    { Value: shortText },
    { Value: quantity },
    { Value: unit },
    { Value: unitPrice },
    { Value: netAmount },
    { Value: materialGroup },
    { Value: deliveryDate }
  ]
);

annotate service.Approvals with @(
  UI.HeaderInfo: {
    TypeName: 'Approval',
    TypeNamePlural: 'Approvals',
    Title: { Value: approver }
  },
  UI.LineItem: [
    { Value: level },
    { Value: approver },
    { Value: decision },
    { Value: comment },
    { Value: decidedAt }
  ],
  Capabilities: {
    Insertable: false,
    Updatable: false,
    Deletable: false
  }
);
