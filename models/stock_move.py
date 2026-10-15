# -*- coding: utf-8 -*-
from odoo import api, fields, models


class StockMove(models.Model):
    _inherit = "stock.move"

    sin_stock_disponible = fields.Json(
        string="Disponible en otros depósitos",
        compute="_compute_sin_stock_disponible",
        help="Para movimientos sin reserva: stock disponible (cantidad menos "
             "reservado) en la ubicación de existencias de los demás depósitos.",
    )

    @api.depends("product_id", "location_id", "state", "move_line_ids")
    def _compute_sin_stock_disponible(self):
        # Solo interesan los movimientos esperando mercadería y sin línea de operación.
        moves = self.filtered(
            lambda m: not m.move_line_ids
            and m.state in ("confirmed", "partially_available", "waiting")
        )
        (self - moves).sin_stock_disponible = []
        if not moves:
            return
        warehouses = self.env["stock.warehouse"].sudo().search(
            [("lot_stock_id", "!=", False)]
        )
        products = moves.product_id
        Quant = self.env["stock.quant"].sudo()
        # {warehouse.id: {product.id: cantidad disponible en UdM del producto}}
        available = {}
        for wh in warehouses:
            groups = Quant._read_group(
                [
                    ("product_id", "in", products.ids),
                    ("location_id", "child_of", wh.lot_stock_id.id),
                ],
                ["product_id"],
                ["quantity:sum", "reserved_quantity:sum"],
            )
            available[wh.id] = {
                product.id: quantity - reserved for product, quantity, reserved in groups
            }
        for move in moves:
            labels = []
            for wh in warehouses:
                stock_loc = wh.lot_stock_id
                # El depósito de origen ya figura en la etiqueta roja.
                if move.location_id and (
                    move.location_id == stock_loc
                    or move.location_id.parent_path.startswith(stock_loc.parent_path)
                ):
                    continue
                qty = available[wh.id].get(move.product_id.id, 0.0)
                qty = move.product_id.uom_id._compute_quantity(
                    qty, move.product_uom, round=False
                )
                if qty > 0:
                    labels.append("%s: %s" % (wh.code, "{:g}".format(round(qty, 2))))
            move.sin_stock_disponible = labels

    def _get_fields_stock_barcode(self):
        # La app de códigos de barra necesita la UdM, el estado y el stock
        # disponible en otros depósitos para dibujar los renglones sin reserva.
        fields_list = super()._get_fields_stock_barcode()
        for field in ("product_uom", "state", "sin_stock_disponible"):
            if field not in fields_list:
                fields_list.append(field)
        return fields_list
