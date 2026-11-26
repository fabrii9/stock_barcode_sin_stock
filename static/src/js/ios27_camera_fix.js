/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";
import { isIOS } from "@web/core/browser/feature_detection";
import { BarcodeVideoScanner } from "@web/core/barcode/barcode_video_scanner";

/**
 * Cámara en negro en iPhone con iOS 27 (app de Odoo o Safari).
 *
 * WebKit en iOS 27 no dibuja el video de la cámara en un <video> que se creó
 * clonando un <template>, que es como Owl arma los componentes. La cámara se
 * enciende (punto verde del iPhone) pero la vista previa queda vacía.
 * WebKit: https://bugs.webkit.org/show_bug.cgi?id=320979
 *
 * Es la misma corrección que Odoo publicó en 18.0 (commit 6f48224475,
 * PR odoo/odoo#293137): en iOS, reemplazar el <video> por una copia importada
 * en el documento principal antes de conectarle la cámara. La imagen de
 * producción (paquete 18.0.20260504) todavía no la trae.
 *
 * Cómo funciona sin tocar el código estándar: el onMounted original es async y
 * se queda esperando getUserMedia(); este onMounted se registra después, así
 * que corre en esa espera y deja el <video> nuevo en videoPreviewRef. Cuando el
 * original retoma, conecta la cámara al <video> nuevo.
 *
 * Sacar cuando Odoo se actualice a una versión que ya incluya el arreglo.
 */
patch(BarcodeVideoScanner.prototype, {
    setup() {
        super.setup(...arguments);
        if (!isIOS()) {
            return;
        }
        onMounted(() => {
            const original = this.videoPreviewRef.el;
            if (!original || original.srcObject) {
                return;
            }
            const videoEl = document.importNode(original);
            original.replaceWith(videoEl);
            this.videoPreviewRef = { el: videoEl };
        });
    },
});
