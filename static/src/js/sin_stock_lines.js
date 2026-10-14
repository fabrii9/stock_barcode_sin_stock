/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import BarcodePickingModel from "@stock_barcode/models/barcode_picking_model";
import LineComponent from "@stock_barcode/components/line";
import MainComponent from "@stock_barcode/components/main";
import { BackorderDialog } from "@stock_barcode/components/backorder_dialog";
import { _t } from "@web/core/l10n/translation";

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
            });
        }
        return lines;
    },

    /**
     * Cuando el operario encuentra físicamente el producto, el renglón pasa a
     * ser una línea normal (se crea la línea de operación al guardar).
     */
    _confirmSinStockLine(line) {
        if (!line || !line.sin_stock) {
            return;
        }
        line.sin_stock = false;
        if (!this.linesToSave.includes(line.virtual_id)) {
            this.linesToSave.push(line.virtual_id);
        }
    },

    _findLine(barcodeData) {
        const found = super._findLine(...arguments);
        if (found && found.sin_stock) {
            this._confirmSinStockLine(found);
            this.notification(
                _t("%s no tiene stock en el sistema: se registra igual.", barcodeData.product.display_name),
                { type: "warning" }
            );
        }
        return found;
    },

    updateLineQty(virtualId) {
        this._confirmSinStockLine(this.pageLines.find((l) => l.virtual_id === virtualId));
        return super.updateLineQty(...arguments);
    },

    /**
     * Si hay renglones sin stock y todavía no se procesó nada, el estándar
     * valida sin preguntar y genera el pedido parcial. Acá se pide confirmación.
     */
    async validate() {
        const lines = this.currentState.lines;
        const hasSinStock = lines.some((l) => l.sin_stock);
        const nothingProcessed = !lines.some((l) => l.qty_done > 0);
        if (this.config.create_backorder === "ask" && hasSinStock && nothingProcessed) {
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

patch(MainComponent.prototype, {
    async onOpenProductPage(line) {
        if (line && line.sin_stock) {
            this.env.model._confirmSinStockLine(line);
        }
        return super.onOpenProductPage(...arguments);
    },
});

patch(LineComponent.prototype, {
    get componentClasses() {
        return [super.componentClasses, this.line.sin_stock ? "o_line_sin_stock" : ""].join(" ");
    },
});
