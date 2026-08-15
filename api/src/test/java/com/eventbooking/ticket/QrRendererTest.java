package com.eventbooking.ticket;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import org.junit.jupiter.api.Test;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The renderer is only worth anything if a scanner can read what comes out, so
 * the main test here does not inspect the SVG - it parses the SVG back into a
 * grid and hands that to ZXing's decoder. That covers the part most likely to
 * be quietly wrong: the run-length merging in the path builder, where an
 * off-by-one produces a picture that still looks like a QR code and scans as
 * nothing.
 */
class QrRendererTest {

    /** The path segments the renderer emits: M{x} {y}h{run}v1H{x}z */
    private static final Pattern RUN = Pattern.compile("M(\\d+) (\\d+)h(\\d+)v1H\\d+z");
    private static final Pattern VIEW_BOX = Pattern.compile("viewBox=\"0 0 (\\d+) (\\d+)\"");

    private final QrRenderer renderer = new QrRenderer(new TicketProperties("x".repeat(32), 256, 4));

    @Test
    void producesAQrCodeThatDecodesBackToThePayload() throws Exception {
        String payload = "EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ";

        String svg = renderer.toSvg(payload);
        Result decoded = decode(parseSvgToMatrix(svg));

        assertThat(decoded.getText()).isEqualTo(payload);
    }

    @Test
    void survivesTheLongestPayloadTicketingCouldProduce() throws Exception {
        // A ticket id far past anything this platform will reach, to be sure the
        // QR version scales rather than the encoder falling over.
        String payload = "EBT1." + Long.MAX_VALUE + ".ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ";

        assertThat(decode(parseSvgToMatrix(renderer.toSvg(payload))).getText()).isEqualTo(payload);
    }

    @Test
    void keepsTheSpecifiedQuietZone() {
        // 4 modules of margin, per the QR spec. Without it scanners fail to find
        // the finder patterns against a busy page.
        String svg = renderer.toSvg("EBT1.1.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ");
        BitMatrix matrix = parseSvgToMatrix(svg);

        for (int x = 0; x < matrix.getWidth(); x++) {
            for (int y = 0; y < 4; y++) {
                assertThat(matrix.get(x, y)).as("top margin at %d,%d", x, y).isFalse();
            }
        }
    }

    @Test
    void scalesThroughTheViewBoxRatherThanTheModuleGrid() {
        // Two sizes must differ only in the presentation attributes: the code
        // itself is identical, which is what makes the image resolution-free.
        String small = renderer.toSvg("EBT1.1.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ", 128);
        String large = renderer.toSvg("EBT1.1.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ", 1024);

        assertThat(small).contains("width=\"128\"").contains("height=\"128\"");
        assertThat(large).contains("width=\"1024\"").contains("height=\"1024\"");
        assertThat(pathOf(small)).isEqualTo(pathOf(large));
    }

    @Test
    void paintsAnOpaqueWhiteGround() {
        // A transparent QR on a dark-mode page renders inverted, and an inverted
        // code does not scan.
        assertThat(renderer.toSvg("EBT1.1.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ"))
                .contains("fill=\"#ffffff\"");
    }

    @Test
    void staysSmallEnoughToInline() {
        // Merged runs rather than one <rect> per module: the difference between
        // roughly 3 KB and roughly 60 KB, which matters when a page shows a
        // family's worth of tickets at once.
        String svg = renderer.toSvg("EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S8Y6h_qYyGDlP2LQ");

        assertThat(svg.length()).isLessThan(8_000);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Reads the emitted SVG back into the module grid it claims to draw. */
    private static BitMatrix parseSvgToMatrix(String svg) {
        Matcher viewBox = VIEW_BOX.matcher(svg);
        assertThat(viewBox.find()).as("the SVG must carry a viewBox").isTrue();

        BitMatrix matrix = new BitMatrix(
                Integer.parseInt(viewBox.group(1)), Integer.parseInt(viewBox.group(2)));

        Matcher runs = RUN.matcher(pathOf(svg));
        while (runs.find()) {
            int x = Integer.parseInt(runs.group(1));
            int y = Integer.parseInt(runs.group(2));
            int length = Integer.parseInt(runs.group(3));
            for (int i = 0; i < length; i++) {
                matrix.set(x + i, y);
            }
        }
        return matrix;
    }

    private static String pathOf(String svg) {
        int start = svg.indexOf("d=\"") + 3;
        return svg.substring(start, svg.indexOf('"', start));
    }

    private static Result decode(BitMatrix matrix) throws Exception {
        return new QRCodeReader().decode(
                new BinaryBitmap(new GlobalHistogramBinarizer(new MatrixLuminanceSource(matrix, 4))));
    }

    /**
     * Presents a module grid to ZXing as an image. Scaled up because the
     * detector looks for finder patterns by ratio, and one pixel per module
     * leaves it nothing to measure.
     */
    private static final class MatrixLuminanceSource extends LuminanceSource {

        private static final byte BLACK = 0;
        private static final byte WHITE = (byte) 0xFF;

        private final BitMatrix matrix;
        private final int scale;

        MatrixLuminanceSource(BitMatrix matrix, int scale) {
            super(matrix.getWidth() * scale, matrix.getHeight() * scale);
            this.matrix = matrix;
            this.scale = scale;
        }

        @Override
        public byte[] getRow(int y, byte[] row) {
            byte[] target = (row == null || row.length < getWidth()) ? new byte[getWidth()] : row;
            for (int x = 0; x < getWidth(); x++) {
                target[x] = matrix.get(x / scale, y / scale) ? BLACK : WHITE;
            }
            return target;
        }

        @Override
        public byte[] getMatrix() {
            byte[] pixels = new byte[getWidth() * getHeight()];
            for (int y = 0; y < getHeight(); y++) {
                for (int x = 0; x < getWidth(); x++) {
                    pixels[y * getWidth() + x] = matrix.get(x / scale, y / scale) ? BLACK : WHITE;
                }
            }
            return pixels;
        }
    }
}
