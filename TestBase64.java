import java.util.Base64;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public class TestBase64 {
    public static void main(String[] args) throws Exception {
        String base64 = "eyJzdGF0dXMiOnsiY29kZSI6MjYsIm1lc3NhZ2UiOiJJbnZhbGlkIE1lcmNoYW50IFByb2ZpbGUuIiwicHdfdHJhbl9pZCI6IjE3ODc2MDA4NzM1NDkifX0%3D";
        try {
            System.out.println(new String(Base64.getDecoder().decode(base64)));
        } catch (Exception e) {
            System.out.println("Exception: " + e.getMessage());
        }
        String decodedUrl = URLDecoder.decode(base64, StandardCharsets.UTF_8.name());
        System.out.println("Decoded URL: " + new String(Base64.getDecoder().decode(decodedUrl)));
    }
}
