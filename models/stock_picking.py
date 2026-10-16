# -*- coding: utf-8 -*-
import logging

from odoo import models

_logger = logging.getLogger(__name__)


class StockPicking(models.Model):
    _inherit = "stock.picking"

    def _sin_stock_refresh_reservation(self):
        """Equivale a entrar a la orden y presionar "Comprobar disponibilidad":
        reintenta reservar los movimientos que no tienen todo reservado. Solo en
        tipos de operación con reserva "al confirmar"."""
        pickings = self.filtered(
            lambda p: p.state in ("confirmed", "waiting", "assigned")
            and p.picking_type_id.reservation_method == "at_confirm"
        )
        for picking in pickings:
            moves = picking.move_ids.filtered(
                lambda m: m.state in ("confirmed", "partially_available")
            )
            if not moves:
                continue
            try:
                with self.env.cr.savepoint():
                    moves._action_assign()
            except Exception:  # no romper la app por un fallo de reserva
                _logger.exception("No se pudo refrescar la reserva de %s", picking.name)

    def _get_stock_barcode_data(self):
        self._sin_stock_refresh_reservation()
        return super()._get_stock_barcode_data()
