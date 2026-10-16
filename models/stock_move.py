# -*- coding: utf-8 -*-
from collections import defaultdict

from odoo import api, fields, models


def _fmt(value):
    return "{:g}".format(round(value, 2))


class StockMove(models.Model):
    _inherit = "stock.move"

    sin_stock_info = fields.Json(
        string="Detalle de falta de stock",
        compute="_compute_sin_stock_info",
        help="Para movimientos sin reserva: estado (rojo = sin stock en el "
             "origen, amarillo = hay stock pero no se pudo reservar), cantidades "
             "en el origen y stock disponible en los demás depósitos.",
    )

    @api.depends("product_id", "location_id", "state", "move_line_ids")
    def _compute_sin_stock_info(self):
        # Solo interesan los movimientos esperando mercadería y sin línea de operación.
        moves = self.filtered(
            lambda m: not m.move_line_ids
            and m.state in ("confirmed", "partially_available", "waiting")
        )
        (self - moves).sin_stock_info = False
        if not moves:
            return
        Quant = self.env["stock.quant"].sudo()
        warehouses = self.env["stock.warehouse"].sudo().search(
            [("lot_stock_id", "!=", False)]
        )
        products = moves.product_id

        # Existencias de cada depósito: {wh.id: {product.id: (en mano, reservado)}}
        wh_stock = {}
        for wh in warehouses:
            groups = Quant._read_group(
                [("product_id", "in", products.ids),
                 ("location_id", "child_of", wh.lot_stock_id.id)],
                ["product_id"],
                ["quantity:sum", "reserved_quantity:sum"],
            )
            wh_stock[wh.id] = {p.id: (q, r) for p, q, r in groups}

        # Existencias en la ubicación de origen de cada movimiento.
        origin_stock = {}
        for location in moves.location_id:
            groups = Quant._read_group(
                [("product_id", "in", products.ids),
                 ("location_id", "child_of", location.id)],
                ["product_id"],
                ["quantity:sum", "reserved_quantity:sum"],
            )
            origin_stock[location.id] = {p.id: (q, r) for p, q, r in groups}

        # Transferencias que tienen reservado el stock del origen.
        reservers = defaultdict(set)
        for line in self.env["stock.move.line"].sudo().search([
            ("product_id", "in", products.ids),
            ("location_id", "child_of", moves.location_id.ids),
            ("state", "not in", ("done", "cancel", "draft")),
            ("quantity", ">", 0),
            ("picking_id", "!=", False),
        ]):
            reservers[(line.location_id.id, line.product_id.id)].add(line.picking_id.name)

        for move in moves:
            product = move.product_id

            def conv(qty, product=product, move=move):
                return product.uom_id._compute_quantity(qty, move.product_uom, round=False)

            on_hand, reserved = origin_stock.get(move.location_id.id, {}).get(
                product.id, (0.0, 0.0)
            )
            on_hand, reserved = conv(on_hand), conv(reserved)
            free = on_hand - reserved
            if free > 0:
                state = "free"       # hay libre pero no se pudo reservar
            elif on_hand > 0:
                state = "reserved"   # hay stock, pero comprometido con otros pedidos
            else:
                state = "none"       # sin stock físico
            pickings = set()
            for (loc_id, prod_id), names in reservers.items():
                if prod_id == product.id and (
                    loc_id == move.location_id.id
                    or self.env["stock.location"].browse(loc_id).parent_path.startswith(
                        move.location_id.parent_path
                    )
                ):
                    pickings |= names
            others = []
            for wh in warehouses:
                qty, res = wh_stock[wh.id].get(product.id, (0.0, 0.0))
                qty = conv(qty - res)
                if qty > 0:
                    others.append("%s: %s" % (wh.code, _fmt(qty)))
            move.sin_stock_info = {
                "state": state,
                "on_hand": _fmt(on_hand),
                "reserved": _fmt(reserved),
                "free": _fmt(free),
                "pickings": sorted(pickings)[:5],
                "others": others,
            }

    def _get_fields_stock_barcode(self):
        # La app de códigos de barra necesita la UdM, el estado y el detalle de
        # faltante para dibujar los renglones sin reserva.
        fields_list = super()._get_fields_stock_barcode()
        for field in ("product_uom", "state", "sin_stock_info"):
            if field not in fields_list:
                fields_list.append(field)
        return fields_list
