package com.eventbooking.ticket;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;

/**
 * Draws a QR as SVG.
 *
 * <p>SVG rather than PNG for three reasons: it stays sharp at whatever size a
 * phone or a printed A4 sheet asks for, it needs no {@code java.awt} on a
 * headless server, and it is a few hundred bytes of text that gzips to almost
 * nothing. The modules are emitted into a {@code viewBox} of one unit per
 * module, so the browser does the scaling and the file is resolution-independent.
 */
@Component
public class QrRenderer {

    /**
     * Error correction M recovers about 15% of a damaged code. Tickets get
     * screenshotted, dimmed, printed badly and held behind phone cases; L is
     * noticeably less forgiving, and H would inflate the code for a robustness
     * a gate scanner does not need.
     */
    private static final ErrorCorrectionLevel ERROR_CORRECTION = ErrorCorrectionLevel.M;

    private final TicketProperties properties;

    public QrRenderer(TicketProperties properties) {
        this.properties = properties;
    }

    public String toSvg(String payload) {
        return toSvg(payload, properties.qrSizePx());
    }

    public String toSvg(String payload, int sizePx) {
        BitMatrix matrix = encode(payload);
        int width = matrix.getWidth();
        int height = matrix.getHeight();

        StringBuilder svg = new StringBuilder(1024);
        svg.append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").append(sizePx)
                .append("\" height=\"").append(sizePx)
                .append("\" viewBox=\"0 0 ").append(width).append(' ').append(height)
                .append("\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"Ticket QR code\">");

        // An explicit white ground, not a transparent one: a dark-mode page
        // behind a transparent QR inverts it, and an inverted code does not scan.
        svg.append("<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>");
        svg.append("<path fill=\"#000000\" d=\"");

        // Horizontal runs are merged into one path segment each. A typical
        // ticket QR is ~1200 dark modules; as individual <rect> elements that
        // is a 60 KB document, and as merged runs it is closer to 3 KB.
        for (int y = 0; y < height; y++) {
            int runStart = -1;
            for (int x = 0; x <= width; x++) {
                boolean dark = x < width && matrix.get(x, y);
                if (dark && runStart < 0) {
                    runStart = x;
                } else if (!dark && runStart >= 0) {
                    svg.append('M').append(runStart).append(' ').append(y)
                            .append('h').append(x - runStart).append("v1H").append(runStart).append('z');
                    runStart = -1;
                }
            }
        }

        svg.append("\"/></svg>");
        return svg.toString();
    }

    private BitMatrix encode(String payload) {
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, ERROR_CORRECTION);
        hints.put(EncodeHintType.MARGIN, properties.qrMarginModules());
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");

        try {
            // Asking for 1x1 makes ZXing return the code at its intrinsic module
            // size (it never scales below that) rather than a bitmap padded to
            // some pixel dimension. The viewBox above then handles the sizing.
            return new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 1, 1, hints);
        } catch (WriterException e) {
            // Only reachable if the payload cannot fit any QR version, which for
            // a 60-character ticket token means something is badly wrong.
            throw new IllegalStateException("Cannot encode ticket QR", e);
        }
    }
}
