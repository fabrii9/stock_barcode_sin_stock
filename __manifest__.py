# -*- coding: utf-8 -*-
{
    "name": "Barcode: mostrar productos sin stock",
    "summary": "La app de Códigos de barra muestra en rojo los productos del "
               "picking que no tienen stock reservado en la ubicación",
    "version": "18.0.1.2.0",
    "category": "Inventory/Stock",
    "author": "Mundolimpio",
    "license": "LGPL-3",
    "depends": ["stock_barcode"],
    "data": ["security/security.xml"],
    "assets": {
        "web.assets_backend": [
            "stock_barcode_sin_stock/static/src/js/*.js",
            "stock_barcode_sin_stock/static/src/scss/*.scss",
            "stock_barcode_sin_stock/static/src/xml/*.xml",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
