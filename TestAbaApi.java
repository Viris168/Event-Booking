import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.LinkedHashMap;
import java.util.Map;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class TestAbaApi {
    public static void main(String[] args) throws Exception {
        // MOCK data (we just need valid formats, though the signature might be invalid,
        // let's see if the sandbox returns an error or a redirect)
        String merchantId = "abaa0115";
        String tranId = "1787600873549";
        String reqTime = "20260824194000";
        String amount = "15.00";
        String hash = "fakehash";
        
        StringBuilder formBody = new StringBuilder();
        formBody.append("req_time=").append(reqTime).append("&");
        formBody.append("merchant_id=").append(merchantId).append("&");
        formBody.append("tran_id=").append(tranId).append("&");
        formBody.append("amount=").append(amount).append("&");
        formBody.append("firstname=test&lastname=&email=&phone=&");
        formBody.append("type=purchase&payment_option=abapay_khqr&currency=USD&view_type=popup&payment_gate=0&");
        formBody.append("hash=").append(hash);
        
        HttpClient client = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
            
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(formBody.toString()))
            .build();
            
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        
        System.out.println("Status: " + response.statusCode());
        System.out.println("Location: " + response.headers().firstValue("Location").orElse("None"));
        System.out.println("Body: " + response.body());
    }
}
