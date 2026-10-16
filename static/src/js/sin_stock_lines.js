/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import BarcodePickingModel from "@stock_barcode/models/barcode_picking_model";
import LineComponent from "@stock_barcode/components/line";
import { BackorderDialog } from "@stock_barcode/components/backorder_dialog";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";

const PARTIAL_GROUP = "stock_barcode_sin_stock.group_validar_parcial_sin_stock";

/**
 * Agrega un renglón "fantasma" por cada movimiento del picking que no tiene
 * ninguna línea de operación (es decir, sin stock reservado en la ubicación).
 * El renglón es solo visual: sin id y con qty_done = 0 nunca se guarda.
 */
patch(BarcodePickingModel.prototype, {
    _createLinesState() {
        const lines = super._createLinesState(...arguments);
        const picking = this.cache.getRecord(this.resModel, this.resId);
        if (!picking || ["done", "cancel"].includes(picking.state)) {
            return lines;
        }
        for (const moveId of picking.move_ids || []) {
            const move = this.cache.getRecord("stock.move", moveId);
            if (!move || (move.move_line_ids || []).length || !move.product_uom_qty) {
                continue;
            }
            if (move.state === "cancel" || move.state === "done") {
                continue;
            }
            const product = this.cache.getRecord("product.product", move.product_id);
            const location = this.cache.getRecord("stock.location", move.location_id);
            lines.push({
                id: false,
                dummy_id: false,
                virtual_id: this._uniqueVirtualId,
                move_id: move.id,
                picking_id: picking.id,
                product_id: product,
                product_uom_id: this.cache.getRecord("uom.uom", move.product_uom || product.uom_id),
                location_id: location,
                location_dest_id: this.cache.getRecord("stock.location", picking.location_dest_id),
                lot_id: false,
                lot_name: false,
                package_id: false,
                result_package_id: false,
                owner_id: false,
                qty_done: 0,
                reserved_uom_qty: move.product_uom_qty,
                quantity: 0,
                sin_stock: true,
                sin_stock_info: move.sin_stock_info || { state: 'none', others: [], pickings: [] },
            });
        }
        return lines;
    },

    // Un renglón sin stock es solo informativo: no se escanea, no se edita ni se completa.
    _notifySinStock(line) {
        this.notification(
            _t("%s no se puede procesar en %s (sin stock o reservado para otros pedidos).",
                line.product_id.display_name, line.location_id.display_name),
            { type: "danger" }
        );
    },

    async updateLine(line) {
        if (line && line.sin_stock) {
            this._notifySinStock(line);
            return;
        }
        return super.updateLine(...arguments);
    },

    _updateLineQty(line) {
        if (line && line.sin_stock) {
            return;
        }
        return super._updateLineQty(...arguments);
    },

    updateLineQty(virtualId) {
        const line = this.pageLines.find((l) => l.virtual_id === virtualId);
        if (line && line.sin_stock) {
            this._notifySinStock(line);
            return;
        }
        return super.updateLineQty(...arguments);
    },

    lineCanBeEdited(line) {
        return line && line.sin_stock ? false : super.lineCanBeEdited(...arguments);
    },

    lineCanBeDeleted(line) {
        return line && line.sin_stock ? false : super.lineCanBeDeleted(...arguments);
    },

    /**
     * No se puede validar un picking con renglones sin stock, salvo los
     * usuarios del grupo "validar parcial con faltantes", que reciben el
     * diálogo de pedido parcial.
     */
    async validate() {
        const lines = this.currentState.lines;
        const sinStock = lines.filter((l) => l.sin_stock);
        if (!sinStock.length) {
            return super.validate(...arguments);
        }
        const canForce = await user.hasGroup(PARTIAL_GROUP);
        if (!canForce) {
            this.trigger("playSound");
            this.notification(
                _t("No se puede validar: %s producto(s) sin stock en %s. Corregir el stock o avisar a un supervisor.",
                    sinStock.length, sinStock[0].location_id.display_name),
                { type: "danger", sticky: true }
            );
            return;
        }
        const nothingProcessed = !lines.some((l) => l.qty_done > 0);
        if (this.config.create_backorder === "ask" && nothingProcessed) {
            this.trigger("playSound");
            return this.dialogService.add(BackorderDialog, {
                displayUoM: this.groups.group_uom,
                uncompletedLines: lines.filter((l) => l.reserved_uom_qty > l.qty_done),
                onApply: () => super.validate(...arguments),
            });
        }
        return super.validate(...arguments);
    },
});

patch(LineComponent.prototype, {
    get componentClasses() {
        return [super.componentClasses, this.line.sin_stock ? "o_line_sin_stock" : "", this.line.sin_stock && this.line.sin_stock_info.state !== "none" ? "o_line_sin_stock_reservado" : ""].join(" ");
    },
    get displayIncrementButton() {
        return this.line.sin_stock ? false : super.displayIncrementButton;
    },
    get displayFulfillbutton() {
        return this.line.sin_stock ? false : super.displayFulfillbutton;
    },
});
