sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/table/Column",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/ColumnListItem"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    DateFormat,
    Fragment,
    Filter,
    FilterOperator,
    ValueHelpDialog,
    UIColumn,
    MColumn,
    Text,
    Label,
    ColumnListItem
) {
    "use strict";

    return Controller.extend("znewpost.controller.View1", {

        onInit: function () {
            var oLocalModel = new JSONModel({
                selection: {
                    reservation: "",
                    postingDate: new Date(),
                    salesOrder: "",
                    productionOrder: "",
                    lotNumber: "",
                    headerPlant: ""
                },
                scannedBatches: []
            });

            this.getView().setModel(oLocalModel, "local");
            this._oCurrentBatchRowContext = null;
            this._oBatchValueHelpDialog = null;
        },

        onReservationChange: async function (oEvent) {
            var sReservation = oEvent.getSource().getValue().trim();
            var oLocalModel = this.getView().getModel("local");

            if (!sReservation) {
                oLocalModel.setProperty("/selection/salesOrder", "");
                oLocalModel.setProperty("/selection/productionOrder", "");
                oLocalModel.setProperty("/selection/lotNumber", "");
                oLocalModel.setProperty("/selection/headerPlant", "");
                oLocalModel.setProperty("/scannedBatches", []);
                return;
            }

            await this._fetchReservationHeader(sReservation);
            await this._fetchReservationItems(sReservation);
        },

        _fetchReservationHeader: async function (sReservation) {
            var oLocalModel = this.getView().getModel("local");
            var sServiceUrl =
                "/sap/opu/odata4/sap/zsb_trnansfer_posting/srvd_a2x/sap/zsd_trnasfer_posting/0001/ZI_GET_RES_HDR" +
                "?$filter=Reservation eq '" + encodeURIComponent(sReservation) + "'";

            try {
                var oResponse = await fetch(sServiceUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    }
                });

                if (!oResponse.ok) {
                    throw new Error("HTTP status " + oResponse.status);
                }

                var oData = await oResponse.json();
                var aResults = oData.value || [];

                if (!aResults.length) {
                    oLocalModel.setProperty("/selection/salesOrder", "");
                    oLocalModel.setProperty("/selection/productionOrder", "");
                    oLocalModel.setProperty("/selection/lotNumber", "");
                    oLocalModel.setProperty("/selection/headerPlant", "");
                    return;
                }

                var oHeader = aResults[0];

                oLocalModel.setProperty("/selection/salesOrder", oHeader.sales_order || "");
                oLocalModel.setProperty("/selection/productionOrder", oHeader.prod_order || "");
                oLocalModel.setProperty("/selection/lotNumber", oHeader.YY1_LotNumber2_ORD || "");
                oLocalModel.setProperty("/selection/headerPlant", oHeader.plant || "");
                oLocalModel.refresh(true);

            } catch (oError) {
                oLocalModel.setProperty("/selection/salesOrder", "");
                oLocalModel.setProperty("/selection/productionOrder", "");
                oLocalModel.setProperty("/selection/lotNumber", "");
                oLocalModel.setProperty("/selection/headerPlant", "");
                console.error("Reservation header fetch error:", oError);
                MessageBox.error("Failed to fetch reservation header details");
            }
        },

        _fetchReservationItems: async function (sReservation) {
            var oLocalModel = this.getView().getModel("local");
            var sServiceUrl =
                "/sap/opu/odata4/sap/zsb_trnansfer_posting/srvd_a2x/sap/zsd_trnasfer_posting/0001/ZI_GET_RES_ITM" +
                "?$filter=Reservation eq '" + encodeURIComponent(sReservation) + "'";

            try {
                var oResponse = await fetch(sServiceUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    }
                });

                if (!oResponse.ok) {
                    throw new Error("HTTP status " + oResponse.status);
                }

                var oData = await oResponse.json();
                var aResults = oData.value || [];

                var aMapped = aResults.map(function (oItem, iIndex) {
                    var fReqQty = parseFloat(oItem.ResvnItmRequiredQtyInBaseUnit) || 0;

                    return {
                        groupId: "GRP_" + iIndex + "_" + Date.now(),
                        isAutoSplitRow: false,

                        reservation_item: oItem.ReservationItem || "",
                        material: oItem.Product || "",
                        description: oItem.ProductDescription || "",
                        requiredQty: fReqQty,
                        requiredQtyTotal: fReqQty,
                        reqUom: oItem.BaseUnit || "",

                        batch: "",
                        toBatch: "",
                        issuedQty: "",
                        maxIssuedQty: "",
                        uom: "",
                        plant: oItem.Plant || "",
                        issueLocation: oItem.Issueloc || "",
                        receivingLocation: oItem.StorageLocation || "",
                        salesOrder: oItem.sales_order || "",
                        salesOrderItem: oItem.so_item || "",
                        productionOrder: oItem.prod_order || "",
                        productType: oItem.ProductType || ""
                    };
                });

                oLocalModel.setProperty("/scannedBatches", aMapped);
                oLocalModel.refresh(true);

                if (aMapped.length === 0) {
                    MessageToast.show("No items found for this reservation");
                } else {
                    MessageToast.show("Reservation items fetched successfully");
                }

            } catch (oError) {
                oLocalModel.setProperty("/scannedBatches", []);
                MessageBox.error("Failed to fetch reservation items");
                console.error("Reservation fetch error:", oError);
            }
        },

        _setToBatchForRow: function (sPath) {
            var oLocalModel = this.getView().getModel("local");
            var oRowData = oLocalModel.getProperty(sPath);

            if (!oRowData) {
                return;
            }

            var sHeaderLotNumber = oLocalModel.getProperty("/selection/lotNumber") || "";
            var sProductType = (oRowData.productType || "").toUpperCase();
            var sFromBatch = oRowData.batch || "";

            if (sProductType === "ZFGP") {
                oLocalModel.setProperty(sPath + "/toBatch", sHeaderLotNumber);
            } else {
                oLocalModel.setProperty(sPath + "/toBatch", sFromBatch);
            }
        },

        onFromBatchValueHelp: function (oEvent) {
            this._oCurrentBatchRowContext = oEvent.getSource().getBindingContext("local");

            if (!this._oCurrentBatchRowContext) {
                MessageBox.error("Unable to identify selected row.");
                return;
            }

            this._openBatchValueHelp();
        },

        _openBatchValueHelp: function () {
            var oRowData = this._oCurrentBatchRowContext.getObject();
            var oView = this.getView();

            if (!this._oBatchValueHelpDialog) {
                this._oBatchValueHelpDialog = new ValueHelpDialog({
                    title: "Select Batch",
                    supportMultiselect: false,
                    supportRanges: false,
                    key: "Batch",
                    descriptionKey: "ProductDescription",
                    ok: this._onBatchValueHelpOk.bind(this),
                    cancel: this._onBatchValueHelpCancel.bind(this),
                    afterClose: function () {
                        if (this._sPendingNextFocusPath) {
                            var sPath = this._sPendingNextFocusPath;
                            this._sPendingNextFocusPath = null;

                            jQuery.sap.delayedCall(200, this, function () {
                                this._focusNextFromBatchInput(sPath);
                            });
                        }
                    }.bind(this)
                });

                oView.addDependent(this._oBatchValueHelpDialog);
            }

            var oDialog = this._oBatchValueHelpDialog;

            oDialog.getTableAsync().then(function (oTable) {
                oTable.setModel(oView.getModel());

                if (oTable.bindRows) {
                    oTable.destroyColumns();

                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Material" }),
                        template: new Text({ text: "{Material}" })
                    }));
                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Description" }),
                        template: new Text({ text: "{ProductDescription}" })
                    }));
                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Quantity" }),
                        template: new Text({ text: "{QTY}" })
                    }));
                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "UoM" }),
                        template: new Text({ text: "{MaterialBaseUnit}" })
                    }));

                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Issue Location" }),
                        template: new Text({ text: "{StorageLocation}" })
                    }));

                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Sales Order" }),
                        template: new Text({ text: "{SDDocument}" })
                    }));

                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Sales Order Item" }),
                        template: new Text({ text: "{SDDocumentItem}" })
                    }));
                    oTable.addColumn(new UIColumn({
                        label: new Label({ text: "Batch" }),
                        template: new Text({ text: "{Batch}" })
                    }));


                    oTable.bindRows({
                        path: "/ZI_GET_BATCHES_311E"
                    });

                    var aFilters = [];
                    if (oRowData.material) {
                        aFilters.push(new Filter("Material", FilterOperator.EQ, oRowData.material));
                    }
                    if (oRowData.plant) {
                        aFilters.push(new Filter("Plant", FilterOperator.EQ, oRowData.plant));
                    }
                    if (oRowData.salesOrder) {
                        aFilters.push(new Filter("SDDocument", FilterOperator.EQ, oRowData.salesOrder));
                    }
                    if (oRowData.salesOrderItem) {
                        aFilters.push(new Filter("SDDocumentItem", FilterOperator.EQ, oRowData.salesOrderItem));
                    }
                    if (oRowData.issueLocation) {
                        aFilters.push(new Filter("StorageLocation", FilterOperator.EQ, oRowData.issueLocation));
                    }

                    var oRowsBinding = oTable.getBinding("rows");
                    if (oRowsBinding) {
                        oRowsBinding.filter(aFilters);
                    }
                } else if (oTable.bindItems) {
                    oTable.destroyColumns();

                    oTable.addColumn(new MColumn({
                        header: new Label({ text: "Material" })
                    }));
                    oTable.addColumn(new MColumn({
                        header: new Label({ text: "Description" })
                    }));
                    oTable.addColumn(new MColumn({
                        header: new Label({ text: "Quantity" })
                    }));
                    oTable.addColumn(new MColumn({
                        header: new Label({ text: "UoM" })
                    }));
                    oTable.addColumn(new MColumn({
                        header: new Label({ text: "Batch" })
                    }));

                    oTable.bindItems({
                        path: "/ZI_GET_BATCHES_311E",
                        template: new ColumnListItem({
                            cells: [
                                new Text({ text: "{Material}" }),
                                new Text({ text: "{ProductDescription}" }),
                                new Text({ text: "{QTY}" }),
                                new Text({ text: "{Batch}" }),
                                new Text({ text: "{SDocument}" }),
                                new Text({ text: "{SDocumentItem}" }),
                            ]
                        })
                    });

                    var aMobileFilters = [];
                    if (oRowData.material) {
                        aMobileFilters.push(new Filter("Material", FilterOperator.EQ, oRowData.material));
                    }
                    if (oRowData.plant) {
                        aMobileFilters.push(new Filter("Plant", FilterOperator.EQ, oRowData.plant));
                    }

                    if (oRowData.salesOrder) {
                        aMobileFilters.push(new Filter("SDDocument", FilterOperator.EQ, oRowData.salesOrder));
                    }

                    if (oRowData.salesOrderItem) {
                        aMobileFilters.push(new Filter("SDDocumentItem", FilterOperator.EQ, oRowData.salesOrderItem));
                    }

                    var oItemsBinding = oTable.getBinding("items");
                    if (oItemsBinding) {
                        oItemsBinding.filter(aMobileFilters);
                    }
                }

                oDialog.update();
                oDialog.open();
            });
        },

        _onBatchValueHelpOk: function () {
            var oDialog = this._oBatchValueHelpDialog;
            var oTable = oDialog.getTable();
            var oSelectedContext = null;

            if (oTable.getSelectedIndices) {
                var aSelectedIndices = oTable.getSelectedIndices();
                if (aSelectedIndices && aSelectedIndices.length > 0) {
                    oSelectedContext = oTable.getContextByIndex(aSelectedIndices[0]);
                }
            } else if (oTable.getSelectedItem) {
                var oSelectedItem = oTable.getSelectedItem();
                if (oSelectedItem) {
                    oSelectedContext = oSelectedItem.getBindingContext();
                }
            }

            if (!oSelectedContext || !this._oCurrentBatchRowContext) {
                MessageToast.show("Please select a batch");
                return;
            }

            var oSelectedData = oSelectedContext.getObject();
            var oLocalModel = this.getView().getModel("local");
            var sPath = this._oCurrentBatchRowContext.getPath();
            var oCurrentRow = oLocalModel.getProperty(sPath);

            var fRemainingBatchQty = this._getRemainingQtyForBatchSelection(oSelectedData, sPath);

            if (fRemainingBatchQty <= 0) {
                if (oTable.clearSelection) {
                    oTable.clearSelection();
                } else if (oTable.removeSelections) {
                    oTable.removeSelections(true);
                }

                if (oTable.setSelectedIndex) {
                    oTable.setSelectedIndex(-1);
                }

                MessageBox.warning("This batch is already fully used and cannot be selected again.", {
                    onClose: function () {
                        if (oDialog) {
                            oDialog.close();
                        }
                    }
                });

                return;
            }

            var fRemainingBeforeAllocation = this._getRemainingQtyForGroup(oCurrentRow);
            var fIssueQtyToSet = this._roundTo3Decimals(
                Math.min(fRemainingBatchQty, fRemainingBeforeAllocation)
            );

            oLocalModel.setProperty(sPath + "/batch", oSelectedData.Batch || "");
            oLocalModel.setProperty(sPath + "/material", oSelectedData.Material || "");
            oLocalModel.setProperty(sPath + "/description", oSelectedData.ProductDescription || "");
            oLocalModel.setProperty(sPath + "/issuedQty", fIssueQtyToSet);
            oLocalModel.setProperty(sPath + "/maxIssuedQty", fRemainingBatchQty);
            oLocalModel.setProperty(sPath + "/uom", oSelectedData.MaterialBaseUnit || "");
            // oLocalModel.setProperty(sPath + "/issueLocation", oSelectedData.StorageLocation || "");

            this._setToBatchForRow(sPath);
            this._sPendingNextFocusPath = sPath;

            oDialog.close();

            this._updateGroupRemainingQtyDisplay(oCurrentRow.groupId);
            this._insertFollowupRowIfNeeded(sPath);

            MessageToast.show("Batch / Quantity selected successfully");
        },

        _onBatchValueHelpCancel: function () {
            if (this._oBatchValueHelpDialog) {
                this._oBatchValueHelpDialog.close();
            }
        },

        onBatchChange: async function (oEvent) {
            var oInput = oEvent.getSource();
            var sBatch = oEvent.getParameter("value").trim();
            var oContext = oInput.getBindingContext("local");

            if (!oContext) {
                return;
            }

            var sPath = oContext.getPath();
            var oLocalModel = this.getView().getModel("local");
            var oRowData = oLocalModel.getProperty(sPath);

            if (!sBatch) {
                oLocalModel.setProperty(sPath + "/issuedQty", "");
                oLocalModel.setProperty(sPath + "/maxIssuedQty", "");
                oLocalModel.setProperty(sPath + "/uom", "");
                // oLocalModel.setProperty(sPath + "/issueLocation", "");
                this._updateGroupRemainingQtyDisplay(oRowData.groupId);
                this._removeExtraEmptyFollowupRows(oRowData.groupId);
                this._insertFollowupRowIfNeeded(sPath);
                return;
            }

            await this._fetchBatchDetailsForRow(sPath, oRowData, sBatch);
        },

       _getUsedQtyForBatch: function (sBatch, sCurrentPath) {
    var aRows = this.getView().getModel("local").getProperty("/scannedBatches") || [];
    var fUsedQty = 0;

    aRows.forEach(function (oRow, iIndex) {
        var sRowPath = "/scannedBatches/" + iIndex;
        var sRowBatch = (oRow.batch || "").trim();

        if (
            sRowPath !== sCurrentPath &&
            sRowBatch !== "" &&
            sBatch &&
            sRowBatch === sBatch
        ) {
            fUsedQty += parseFloat(oRow.issuedQty) || 0;
        }
    });

    return fUsedQty;
},

        // get remaining quantity for a batch selection considering already used quantities in other rows
        _getRemainingQtyForBatchSelection: function (oBatchData, sCurrentPath) {
            var fAvailableQty = parseFloat(oBatchData.QTY) || 0;
            var fUsedQty = this._getUsedQtyForBatch(oBatchData.Batch, sCurrentPath);
            var fRemainingQty = fAvailableQty - fUsedQty;

            return fRemainingQty > 0 ? fRemainingQty : 0;
        },

        _isBatchFullyConsumed: function (oBatchData, sCurrentPath) {
            return this._getRemainingQtyForBatchSelection(oBatchData, sCurrentPath) <= 0;
        },

        _fetchBatchDetailsForRow: async function (sPath, oRowData, sBatch) {
            var oLocalModel = this.getView().getModel("local");

            var aFilters = [];
            aFilters.push("Batch eq '" + encodeURIComponent(sBatch) + "'");

            if (oRowData.material) {
                aFilters.push("Material eq '" + encodeURIComponent(oRowData.material) + "'");
            }

            if (oRowData.SalesOrder) {
                aFilters.push("SDDocument eq '" + encodeURIComponent(oRowData.SalesOrder) + "'");
            }

            if (oRowData.SalesOrderItem) {
                aFilters.push("SDDocumentItem eq '" + encodeURIComponent(oRowData.SalesOrderItem) + "'");
            }

            if (oRowData.plant) {
                aFilters.push("Plant eq '" + encodeURIComponent(oRowData.plant) + "'");
            }

            var sFilter = "$filter=" + aFilters.join(" and ");

            var sServiceUrl =
                "/sap/opu/odata4/sap/zsb_trnansfer_posting/srvd_a2x/sap/zsd_trnasfer_posting/0001/ZI_GET_BATCHES_311E?" +
                sFilter;

            try {
                var oResponse = await fetch(sServiceUrl, {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    }
                });

                if (!oResponse.ok) {
                    throw new Error("HTTP status " + oResponse.status);
                }

                var oData = await oResponse.json();
                var aResults = oData.value || [];

                if (!aResults.length) {
                    oLocalModel.setProperty(sPath + "/issuedQty", "");
                    oLocalModel.setProperty(sPath + "/maxIssuedQty", "");
                    oLocalModel.setProperty(sPath + "/uom", "");
                    // oLocalModel.setProperty(sPath + "/issueLocation", "");
                    MessageToast.show("No details found for entered batch");
                    return;
                }

                var oBatch = aResults[0];
                var fRemainingBatchQty = this._getRemainingQtyForBatchSelection(oBatch, sPath);

                if (fRemainingBatchQty <= 0) {
                    oLocalModel.setProperty(sPath + "/batch", "");
                    oLocalModel.setProperty(sPath + "/issuedQty", "");
                    oLocalModel.setProperty(sPath + "/maxIssuedQty", "");
                    oLocalModel.setProperty(sPath + "/uom", "");
                    // oLocalModel.setProperty(sPath + "/issueLocation", "");
                    MessageBox.warning("This batch is already fully used and cannot be selected again.");
                    return;
                }

                var fRemainingBeforeAllocation = this._getRemainingQtyForGroup(oRowData);
                var fIssueQtyToSet = this._roundTo3Decimals(
                    Math.min(fRemainingBatchQty, fRemainingBeforeAllocation)
                );

                oLocalModel.setProperty(sPath + "/issuedQty", fIssueQtyToSet);
                oLocalModel.setProperty(sPath + "/maxIssuedQty", fRemainingBatchQty);
                oLocalModel.setProperty(sPath + "/uom", oBatch.MaterialBaseUnit || "");
                // oLocalModel.setProperty(sPath + "/issueLocation", oBatch.StorageLocation || "");
                oLocalModel.setProperty(sPath + "/description", oBatch.ProductDescription || oRowData.description || "");
                this._setToBatchForRow(sPath);
                this._updateGroupRemainingQtyDisplay(oRowData.groupId);
                this._insertFollowupRowIfNeeded(sPath);

                MessageToast.show("Batch details fetched successfully");

            } catch (oError) {
                oLocalModel.setProperty(sPath + "/issuedQty", "");
                oLocalModel.setProperty(sPath + "/maxIssuedQty", "");
                oLocalModel.setProperty(sPath + "/uom", "");
                // oLocalModel.setProperty(sPath + "/issueLocation", "");
                MessageBox.error("Failed to fetch batch details");
                console.error("Batch fetch error:", oError);
            }
        },

        onIssuedQtyChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue().trim();
            var oContext = oInput.getBindingContext("local");

            if (!oContext) {
                return;
            }

            var sPath = oContext.getPath();
            var oLocalModel = this.getView().getModel("local");
            var oCurrentRow = oLocalModel.getProperty(sPath);
            var fEnteredQty = parseFloat(sValue);
            var fMaxQty = parseFloat(oLocalModel.getProperty(sPath + "/maxIssuedQty"));

            if (sValue === "") {
                oInput.setValueState("None");
                oInput.setValueStateText("");
                oLocalModel.setProperty(sPath + "/issuedQty", "");
                this._updateGroupRemainingQtyDisplay(oCurrentRow.groupId);
                this._removeExtraEmptyFollowupRows(oCurrentRow.groupId);
                this._insertFollowupRowIfNeeded(sPath);
                return;
            }

            if (isNaN(fEnteredQty)) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Enter a valid numeric quantity");
                return;
            }

            if (!isNaN(fMaxQty) && fEnteredQty > fMaxQty) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Issued quantity cannot be greater than " + fMaxQty);
                MessageToast.show("Issued quantity cannot be greater than available quantity");
                return;
            }

            oInput.setValueState("None");
            oInput.setValueStateText("");

            oLocalModel.setProperty(sPath + "/issuedQty", fEnteredQty);
            this._updateGroupRemainingQtyDisplay(oCurrentRow.groupId);

            var fRemaining = this._getRemainingQtyForGroup(oCurrentRow);

            if (fRemaining > 0) {
                this._insertFollowupRowIfNeeded(sPath);
            } else {
                this._removeExtraEmptyFollowupRows(oCurrentRow.groupId);
            }

            oLocalModel.refresh(true);
        },

        _getRowIndexFromPath: function (sPath) {
            return parseInt(sPath.split("/").pop(), 10);
        },

        _getAllocatedQtyForGroup: function (sGroupId) {
            var aRows = this.getView().getModel("local").getProperty("/scannedBatches") || [];

            return aRows
                .filter(function (oRow) {
                    return oRow.groupId === sGroupId;
                })
                .reduce(function (sum, oRow) {
                    return sum + (parseFloat(oRow.issuedQty) || 0);
                }, 0);
        },
        _roundTo3Decimals: function (vValue) {
            var fValue = parseFloat(vValue) || 0;
            return parseFloat(fValue.toFixed(3));
        },

        _getRemainingQtyForGroup: function (oRow) {
            var fTotalRequired = parseFloat(oRow.requiredQtyTotal || oRow.requiredQty || 0);
            var fAllocated = this._getAllocatedQtyForGroup(oRow.groupId);
            var fRemaining = fTotalRequired - fAllocated;
            fRemaining = this._roundTo3Decimals(fRemaining);
            return fRemaining > 0 ? fRemaining : 0;
        },

        _createFollowupRow: function (oSourceRow) {
            var fRemaining = this._getRemainingQtyForGroup(oSourceRow);

            return {
                groupId: oSourceRow.groupId,
                isAutoSplitRow: true,

                reservation_item: oSourceRow.reservation_item || "",
                material: oSourceRow.material || "",
                description: oSourceRow.description || "",
                requiredQty: fRemaining,
                requiredQtyTotal: oSourceRow.requiredQtyTotal || oSourceRow.requiredQty || 0,
                reqUom: oSourceRow.reqUom || "",

                batch: "",
                toBatch: "",
                issuedQty: "",
                maxIssuedQty: "",
                uom: "",
                plant: oSourceRow.plant || "",
                issueLocation: oSourceRow.issueLocation || "",
                receivingLocation: oSourceRow.receivingLocation || "",
                salesOrder: oSourceRow.salesOrder || "",
                salesOrderItem: oSourceRow.salesOrderItem || "",
                productionOrder: oSourceRow.productionOrder || "",
                productType: oSourceRow.productType || ""
            };
        },

        _insertFollowupRowIfNeeded: function (sCurrentPath) {
            var oLocalModel = this.getView().getModel("local");
            var aRows = oLocalModel.getProperty("/scannedBatches") || [];
            var iCurrentIndex = this._getRowIndexFromPath(sCurrentPath);
            var oCurrentRow = aRows[iCurrentIndex];

            if (!oCurrentRow) {
                return;
            }

            var fRemaining = this._getRemainingQtyForGroup(oCurrentRow);

            if (fRemaining <= 0) {
                return;
            }

            var oNextRow = aRows[iCurrentIndex + 1];

            if (
                oNextRow &&
                oNextRow.groupId === oCurrentRow.groupId &&
                !oNextRow.batch &&
                (parseFloat(oNextRow.issuedQty) || 0) === 0
            ) {
                oLocalModel.setProperty("/scannedBatches/" + (iCurrentIndex + 1) + "/requiredQty", fRemaining);
                oLocalModel.refresh(true);
                return;
            }

            var oNewRow = this._createFollowupRow(oCurrentRow);
            aRows.splice(iCurrentIndex + 1, 0, oNewRow);
            oLocalModel.setProperty("/scannedBatches", aRows);
            oLocalModel.refresh(true);
        },

        _removeExtraEmptyFollowupRows: function (sGroupId) {
            var oLocalModel = this.getView().getModel("local");
            var aRows = oLocalModel.getProperty("/scannedBatches") || [];
            var fRemaining = 0;

            var aGroupRows = aRows.filter(function (oRow) {
                return oRow.groupId === sGroupId;
            });

            if (aGroupRows.length > 0) {
                var oAnyRow = aGroupRows[0];
                fRemaining = this._getRemainingQtyForGroup(oAnyRow);
            }

            if (fRemaining > 0) {
                return;
            }

            for (var i = aRows.length - 1; i >= 0; i--) {
                if (
                    aRows[i].groupId === sGroupId &&
                    aRows[i].isAutoSplitRow === true &&
                    !aRows[i].batch &&
                    (
                        aRows[i].issuedQty === "" ||
                        aRows[i].issuedQty === null ||
                        aRows[i].issuedQty === undefined ||
                        parseFloat(aRows[i].issuedQty) === 0
                    )
                ) {
                    aRows.splice(i, 1);
                }
            }

            oLocalModel.setProperty("/scannedBatches", aRows);
            oLocalModel.refresh(true);
        },

        _updateGroupRemainingQtyDisplay: function (sGroupId) {
            var oLocalModel = this.getView().getModel("local");
            var aRows = oLocalModel.getProperty("/scannedBatches") || [];

            var aGroupRows = aRows.filter(function (oRow) {
                return oRow.groupId === sGroupId;
            });

            if (!aGroupRows.length) {
                return;
            }

            var fTotalRequired = parseFloat(aGroupRows[0].requiredQtyTotal || 0);
            var fAllocated = this._getAllocatedQtyForGroup(sGroupId);
            var fRemaining = this._roundTo3Decimals(fTotalRequired - fAllocated);

            if (fRemaining < 0) {
                fRemaining = 0;
            }

            var bFirstFound = false;

            aRows.forEach(function (oRow) {
                if (oRow.groupId === sGroupId) {
                    if (!bFirstFound) {
                        oRow.requiredQty = fTotalRequired;
                        bFirstFound = true;
                    } else if (!oRow.batch && (!oRow.issuedQty || parseFloat(oRow.issuedQty) === 0)) {
                        oRow.requiredQty = fRemaining;
                    }
                }
            });

            oLocalModel.setProperty("/scannedBatches", aRows);
            oLocalModel.refresh(true);
        },
        _focusNextFromBatchInput: function (sCurrentPath) {
            var oTable = this.byId("batchesTable");
            var aItems = oTable.getItems();

            if (!aItems || !aItems.length) {
                return;
            }

            var iCurrentIndex = -1;

            aItems.some(function (oItem, iIndex) {
                var oCtx = oItem.getBindingContext("local");
                if (oCtx && oCtx.getPath() === sCurrentPath) {
                    iCurrentIndex = iIndex;
                    return true;
                }
                return false;
            });

            if (iCurrentIndex === -1) {
                return;
            }

            var iNextIndex = iCurrentIndex + 1;
            if (iNextIndex >= aItems.length) {
                return;
            }

            var oNextItem = aItems[iNextIndex];
            var aCells = oNextItem.getCells();

            if (!aCells || aCells.length < 5) {
                return;
            }

            var oNextFromBatchInput = aCells[4];

            if (oNextFromBatchInput && oNextFromBatchInput.focus) {
                sap.ui.getCore().applyChanges();
                jQuery.sap.delayedCall(100, this, function () {
                    oNextFromBatchInput.focus();
                });
            }
        },

        onNew: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oTable = this.byId("batchesTable");

            oLocalModel.setData({
                selection: {
                    reservation: "",
                    postingDate: new Date(),
                    salesOrder: "",
                    productionOrder: "",
                    lotNumber: "",
                    headerPlant: ""
                },
                scannedBatches: []
            });

            oLocalModel.refresh(true);

            if (oTable) {
                oTable.removeSelections(true);
            }

            var oReservationInput = this.byId("inputReservation");
            if (oReservationInput) {
                oReservationInput.focus();
            }
        },

        onDeleteSelected: function () {
            var oTable = this.byId("batchesTable");
            var oLocalModel = this.getView().getModel("local");
            var aData = oLocalModel.getProperty("/scannedBatches") || [];
            var aSelectedItems = oTable.getSelectedItems();

            if (!aSelectedItems.length) {
                MessageBox.warning("Please select at least one line item to delete.");
                return;
            }

            MessageBox.confirm("Are you sure you want to delete the selected line item(s)?", {
                title: "Confirm Deletion",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                initialFocus: MessageBox.Action.CANCEL,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aIndexesToDelete = aSelectedItems.map(function (oItem) {
                            var sPath = oItem.getBindingContext("local").getPath();
                            return parseInt(sPath.split("/").pop(), 10);
                        });

                        var aNewData = aData.filter(function (oItem, iIndex) {
                            return aIndexesToDelete.indexOf(iIndex) === -1;
                        });

                        oLocalModel.setProperty("/scannedBatches", aNewData);
                        oLocalModel.refresh(true);

                        if (oTable.getBinding("items")) {
                            oTable.getBinding("items").refresh();
                        }

                        oTable.removeSelections(true);

                        MessageToast.show("Selected line item(s) deleted successfully.");
                    }
                }
            });
        },


        onSubmit: function () {
            var oView = this.getView();
            var oLocalModel = oView.getModel("local");
            var oODataModel = oView.getModel();

            var oSelection = oLocalModel.getProperty("/selection");
            var aScannedBatches = oLocalModel.getProperty("/scannedBatches") || [];

            if (!oSelection.reservation || !oSelection.postingDate) {
                MessageBox.error("Please fill Reservation Number and Posting Date before submitting.");
                return;
            }

            if (aScannedBatches.length === 0) {
                MessageBox.error("No reservation items available to submit.");
                return;
            }

            var aItemsToSubmit = aScannedBatches.filter(function (oItem) {
                var fIssuedQty = parseFloat(String(oItem.issuedQty || "").trim());
                return !isNaN(fIssuedQty) && fIssuedQty > 0;
            });

            if (aItemsToSubmit.length === 0) {
                MessageBox.error("Please enter issued quantity for at least one item before submitting.");
                return;
            }

            var aInvalidItems = aItemsToSubmit.filter(function (oItem) {
                return !oItem.material ||

                    !oItem.plant ||
                    !oItem.receivingLocation;
            });

            if (aInvalidItems.length > 0) {
                MessageBox.error("Please fill Material, Unit, Plant, and Receiving Location for all items.");
                return;
            }

            var aInvalidQty = aItemsToSubmit.filter(function (oItem) {
                var fIssued = parseFloat(oItem.issuedQty);
                var fMax = parseFloat(oItem.maxIssuedQty);
                return !isNaN(fIssued) && !isNaN(fMax) && fIssued > fMax;
            });

            if (aInvalidQty.length > 0) {
                MessageBox.error("Issued quantity cannot be greater than fetched quantity.");
                return;
            }

            var oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
            var sFormattedDate = oDateFormat.format(oSelection.postingDate);
            var sReservation = String(oSelection.reservation).padStart(10, "0");

            var aItemsPayload = aItemsToSubmit.map(function (oItem) {
                return {
                    "ReservationItem": (oItem.reservation_item || "").padStart(4, "0"),
                    "Material": oItem.material || "",
                    "Batch": oItem.batch || "",
                    "MatDescription": oItem.description || "",
                    "ReqQty": String(oItem.requiredQty || ""),
                    "Unit": oItem.reqUom || "",
                    "IssuedQty": String(oItem.issuedQty || ""),
                    "IssuedUnit": oItem.uom || "",
                    "IssueLoc": oItem.issueLocation || "",
                    "Plant": oItem.plant || "",
                    "ToBatch": oItem.toBatch || "",
                    "ProdOrd": oItem.productionOrder || "",
                    "ReceiveLoc": oItem.receivingLocation || "",
                    "SalesOrder": (oItem.salesOrder || "").padStart(10, "0"),
                    "SalesOrderItem": (oItem.salesOrderItem || "").padStart(6, "0")
                };
            });

            var oPayload = {
                "Reservation": sReservation,
                "PostingDate": sFormattedDate,
                "_Item": aItemsPayload
            };

            console.log("Submit payload:", JSON.stringify(oPayload, null, 2));

            oView.setBusy(true);

            var oListBinding = oODataModel.bindList("/ZC_TRNS_POST_HDR");
            var oContext = oListBinding.create(oPayload);

            oContext.created().then(function () {
                oView.setBusy(false);

                var sMatDoc = (oContext.getProperty("Materialdocument") || "").trim();
                var sMessage = (oContext.getProperty("Mess") || "").trim();

                if (sMatDoc) {
                    MessageBox.success("Material Document " + sMatDoc + " created successfully.", {
                        onClose: function () {
                            oLocalModel.setData({
                                selection: {
                                    reservation: "",
                                    postingDate: new Date(),
                                    salesOrder: "",
                                    productionOrder: "",
                                    lotNumber: "",
                                    headerPlant: ""
                                },
                                scannedBatches: []
                            });

                            var oReservationInput = oView.byId("inputReservation");
                            if (oReservationInput) {
                                oReservationInput.focus();
                            }
                        }
                    });
                } else {
                    MessageBox.error(sMessage || "Material document was not created.");
                }

            }).catch(function (oError) {
                oView.setBusy(false);

                var sErrorMsg = "Failed to submit transfer posting.";
                if (oError && oError.message) {
                    sErrorMsg = oError.message;
                }

                MessageBox.error(sErrorMsg);
                console.error("Submit error:", oError);
            });
        }

    });
});