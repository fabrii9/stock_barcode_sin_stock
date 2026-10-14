# -*- coding: utf-8 -*-
from odoo import models


class StockMove(models.Model):
    _inherit = "stock.move"

    def _get_fields_stock_barcode(self):
        # La app de códigos de barra necesita la UdM del movimiento para
        # dibujar los renglones sin reserva ("sin stock").
        fields_list = super()._get_fields_stock_barcode()
        for field in ("product_uom", "state"):
            if field not in fields_list:
                fields_list.append(field)
        return fields_list
