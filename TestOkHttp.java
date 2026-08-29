import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.FormBody;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

public class TestOkHttp {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient.Builder()
                .followRedirects(false)
                .build();
                
        FormBody.Builder formBuilder = new FormBody.Builder();
        formBuilder.add("req_time", "20260824194000");
        formBuilder.add("merchant_id", "abaa0115");
        formBuilder.add("tran_id", "1787600873549");
        formBuilder.add("amount", "15.00");
        formBuilder.add("firstname", "test");
        formBuilder.add("lastname", "");
        formBuilder.add("email", "");
        formBuilder.add("phone", "");
        formBuilder.add("type", "purchase");
        formBuilder.add("payment_option", "abapay_khqr");
        formBuilder.add("currency", "USD");
        formBuilder.add("view_type", "popup");
        formBuilder.add("payment_gate", "0");
        formBuilder.add("hash", "fakehash");
        
        Request request = new Request.Builder()
                .url("https://sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase")
                .post(formBuilder.build())
                .build();
                
        try (Response response = client.newCall(request).execute()) {
            System.out.println("Code: " + response.code());
            String location = response.header("Location");
            System.out.println("Location: " + location);
            if (location != null && location.contains("/checkout/")) {
                String base64 = location.substring(location.lastIndexOf('/') + 1);
                String json = new String(Base64.getDecoder().decode(base64), StandardCharsets.UTF_8);
                System.out.println("JSON: " + json);
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"qr_string\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
                if (m.find()) {
                    System.out.println("Found: " + m.group(1));
                }
            } else {
                System.out.println("Body: " + response.body().string());
            }
        }
    }
}
