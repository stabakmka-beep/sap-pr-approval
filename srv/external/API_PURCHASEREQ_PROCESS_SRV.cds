/*
 * Minimal contract for S/4HANA API_PURCHASEREQ_PROCESS_SRV (OData V2).
 * Only the header, item, and cost-center account assignment we actually post
 * are modeled. cds watch mocks this service because package.json gives it no
 * credentials outside the production profile.
 *
 * Replace this file with the Business Accelerator Hub metadata when you have it:
 *   cds import API_PURCHASEREQ_PROCESS_SRV.edmx --as cds --into srv/external
 * Keep the service name so srv/lib/s4-client.js and package.json stay valid.
 * The full API also has purchase req. texts, delivery address, and item notes.
 */
@cds.external
@cds.persistence.skip
service API_PURCHASEREQ_PROCESS_SRV {
  @cds.persistence.skip
  entity A_PurchaseRequisitionHeader {
    key PurchaseRequisition     : String(10);
        PurchaseRequisitionType : String(4);
        PurReqnDescription      : String(40);
        SourceDetermination     : Boolean;
        to_PurchaseReqnItem     : Composition of many A_PurchaseRequisitionItem
                                  on to_PurchaseReqnItem.PurchaseRequisition = PurchaseRequisition;
  }

  @cds.persistence.skip
  entity A_PurchaseRequisitionItem {
    key PurchaseRequisition         : String(10);
    key PurchaseRequisitionItem     : String(5);
        PurchaseRequisitionItemText : String(40);
        Material                    : String(40);
        MaterialGroup               : String(9);
        RequestedQuantity           : Decimal(13, 3);
        BaseUnit                    : String(3);
        PurchaseRequisitionPrice    : Decimal(15, 2);
        PurReqnItemCurrency         : String(5);
        Plant                       : String(4);
        CompanyCode                 : String(4);
        PurchasingGroup             : String(3);
        PurchasingOrganization      : String(4);
        DeliveryDate                : DateTime;
        AccountAssignmentCategory   : String(1);
        to_PurchaseReqnAcctAssgmt   : Composition of many A_PurReqnAcctAssgmt
                                      on to_PurchaseReqnAcctAssgmt.PurchaseRequisition = PurchaseRequisition
                                      and to_PurchaseReqnAcctAssgmt.PurchaseRequisitionItem = PurchaseRequisitionItem;
  }

  @cds.persistence.skip
  entity A_PurReqnAcctAssgmt {
    key PurchaseRequisition           : String(10);
    key PurchaseRequisitionItem       : String(5);
    key PurchaseReqnAcctAssgmtNumber  : String(2);
        CostCenter                    : String(10);
        GLAccount                     : String(10);
        Quantity                      : Decimal(13, 3);
        BaseUnit                      : String(3);
  }
}
