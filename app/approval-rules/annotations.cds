using AdminService as service from '../../srv/admin-service';

annotate service.ApprovalRules with @(
  UI.HeaderInfo: {
    TypeName: 'Approval rule',
    TypeNamePlural: 'Approval rules',
    TypeImageUrl: 'sap-icon://decision',
    Title: { Value: approverRole },
    Description: { Value: companyCode }
  },
  UI.SelectionFields: [
    companyCode,
    costCenter,
    level,
    approverRole
  ],
  UI.LineItem: [
    { Value: companyCode },
    { Value: costCenter },
    { Value: minAmount },
    { Value: maxAmount },
    { Value: level },
    { Value: approverRole }
  ],
  UI.Identification: [
    { Value: companyCode },
    { Value: costCenter },
    { Value: level },
    { Value: approverRole }
  ],
  UI.FieldGroup #Threshold: {
    Label: 'Threshold',
    Data: [
      { Value: companyCode },
      { Value: costCenter },
      { Value: minAmount },
      { Value: maxAmount },
      { Value: level },
      { Value: approverRole }
    ]
  },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Threshold', Label: 'Threshold', Target: '@UI.FieldGroup#Threshold' }
  ],
  UI.PresentationVariant: {
    SortOrder: [
      { Property: companyCode },
      { Property: level }
    ],
    Visualizations: ['@UI.LineItem']
  }
);
