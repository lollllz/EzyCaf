package com.ezycaf.app;

import android.app.Activity;
import android.os.Bundle;
import android.net.*;
import android.content.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.graphics.Color;
import java.net.*;
import java.io.*;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private ConnectivityManager connectivity;
  private WebView web;
  private String origin;
  private boolean active = false;
  private boolean probing = false;
  private Network pairedNetwork;
  private final ConnectivityManager.NetworkCallback wifiCallback = new ConnectivityManager.NetworkCallback() {
    @Override public void onAvailable(Network n) { runOnUiThread(() -> checkNetwork()); }
    @Override public void onLost(Network n) { runOnUiThread(() -> checkNetwork()); }
  };
  private final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
    @Override public void onLost(Network network) { runOnUiThread(() -> checkNetwork()); }
    @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { runOnUiThread(() -> checkNetwork()); }
  };
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    connectivity = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
    connectivity.registerDefaultNetworkCallback(callback);
    connectivity.registerNetworkCallback(new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), wifiCallback);
    origin = getPreferences(MODE_PRIVATE).getString("hub", "");
    showSetup("Connect to the cafe Wi-Fi. Staff access stops when you leave it. Customers use their table QR in a browser.");
  }
  private Network wifiNetwork() {
    NetworkCapabilities current = connectivity.getNetworkCapabilities(connectivity.getActiveNetwork());
    if (current != null && current.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return null;
    // Local Wi-Fi can work without internet, even when Android prefers mobile data.
    for (Network network : connectivity.getAllNetworks()) {
      NetworkCapabilities caps = connectivity.getNetworkCapabilities(network);
      if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return network;
    }
    return null;
  }
  private boolean wifi() { return wifiNetwork() != null; }
  private void checkNetwork() {
    Network current = wifiNetwork();
    if (active && (current == null || !current.equals(pairedNetwork))) {
      active = false;
      if (web != null) { web.stopLoading(); web.loadUrl("about:blank"); web.destroy(); web = null; }
      connectivity.bindProcessToNetwork(null);
      showSetup("Staff access is paused. Rejoin the cafe Wi-Fi and reconnect.");
    }
  }
  private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
  private TextView text(String value, int size) { TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(Color.rgb(24,60,50)); t.setPadding(0,dp(12),0,dp(12)); return t; }
  private void showSetup(String message) {
    ScrollView scroll = new ScrollView(this);
    LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(dp(24),dp(36),dp(24),dp(24)); layout.setBackgroundColor(Color.rgb(247,245,239)); scroll.addView(layout);
    layout.addView(text("EzyCaf Staff",30)); layout.addView(text("Connect this device",23)); layout.addView(text(message,16));
    EditText address = new EditText(this); address.setSingleLine(true); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); address.setHint("http://192.168.1.10:3847"); address.setText(origin); address.setMinHeight(dp(56)); layout.addView(address);
    layout.addView(text("Use the local address shown in the hub setup on your cafe computer. Public customer links do not enable staff access.",14));
    Spinner role = new Spinner(this); role.setMinimumHeight(dp(56)); role.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Table hub", "Kitchen", "Cashier"})); layout.addView(role);
    Button connect = new Button(this); connect.setText(probing ? "Checking…" : "Test connection & continue"); connect.setMinHeight(dp(56)); connect.setEnabled(!probing); layout.addView(connect);
    connect.setOnClickListener(v -> pair(address.getText().toString().trim(), new String[]{"/", "/kitchen", "/cashier"}[role.getSelectedItemPosition()]));
    setContentView(scroll);
  }
  static boolean privateIp(String host) {
    String[] parts = host.split("\\."); if(parts.length != 4) return false;
    int[] p = new int[4]; try { for(int i=0;i<4;i++) { if(!parts[i].matches("[0-9]{1,3}")) return false; p[i]=Integer.parseInt(parts[i]); if(p[i]>255) return false; } } catch(Exception e) { return false; }
    return p[0]==10 || p[0]==192 && p[1]==168 || p[0]==172 && p[1]>=16 && p[1]<=31;
  }
  private void pair(String input, String route) {
    if (!wifi()) { showSetup("Join the cafe Wi-Fi first. Cellular and VPN connections cannot run the staff app."); return; }
    try {
      URI uri = new URI(input);
      if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || !privateIp(uri.getHost()) || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new Exception();
      origin = new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), null, null, null).toString();
    } catch(Exception e) { showSetup("Enter a local IPv4 hub address, for example http://192.168.1.10:3847."); return; }
    probing = true; showSetup("Checking the cafe hub…");
    final String target = origin;
    new Thread(() -> {
      String failure = null;
      HttpURLConnection conn = null;
      try {
        // Bind health probe to the current Wi-Fi network; never fall back to mobile data.
        Network network = wifiNetwork();
        pairedNetwork = network;
        if (!wifi() || network == null) throw new IOException("Wi-Fi disconnected");
        conn = (HttpURLConnection)network.openConnection(new URL(target + "/api/health"));
        conn.setConnectTimeout(5000); conn.setReadTimeout(5000); conn.setInstanceFollowRedirects(false);
        if(conn.getResponseCode()!=200) throw new IOException("Hub unavailable");
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[1024]; int n;
        try(InputStream in=conn.getInputStream()) { while((n=in.read(buffer))!=-1) { out.write(buffer,0,n); if(out.size()>16384) throw new IOException("Invalid hub"); } }
        JSONObject response = new JSONObject(out.toString("UTF-8"));
        if(!response.optString("service").equals("ezycaf-hub") || !response.optString("networkMode").equals("lan-only")) throw new IOException("Not a local staff hub");
      } catch(Exception e) { failure = "Cannot reach the cafe hub. Check Wi-Fi, address and the host firewall."; }
      finally { if(conn!=null) conn.disconnect(); }
      final String result=failure;
      runOnUiThread(() -> { probing=false; if(isFinishing() || isDestroyed()) return; if(result!=null || pairedNetwork == null || !pairedNetwork.equals(wifiNetwork())) showSetup(result!=null ? result : "Wi-Fi disconnected."); else { getPreferences(MODE_PRIVATE).edit().putString("hub",target).apply(); openHub(route); } });
    }).start();
  }
  private boolean allowed(String url) { try { URI u=new URI(url); URI base=new URI(origin); return wifi() && base.getScheme().equals(u.getScheme()) && base.getHost().equals(u.getHost()) && base.getPort()==u.getPort(); } catch(Exception e) { return false; } }
  private void openHub(String route) {
    if (!connectivity.bindProcessToNetwork(pairedNetwork)) { showSetup("Could not bind to cafe Wi-Fi. Reconnect and try again."); return; }
    active=true;
    LinearLayout layout=new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
    Button change=new Button(this); change.setText("Change device / cafe connection"); change.setMinHeight(dp(48)); layout.addView(change);
    change.setOnClickListener(v -> { active=false; web.stopLoading(); web.destroy(); web=null; connectivity.bindProcessToNetwork(null); showSetup("Choose the cafe address and device role."); });
    web=new WebView(this); web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true); web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false); web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !allowed(request.getUrl().toString()); }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if(!allowed(request.getUrl().toString())) return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Cafe Wi-Fi required".getBytes())); return null;
      }
      @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
    });
    layout.addView(web,new LinearLayout.LayoutParams(-1,0,1)); setContentView(layout); web.loadUrl(origin+route);
  }
  @Override protected void onResume() { super.onResume(); checkNetwork(); }
  @Override protected void onDestroy() { connectivity.unregisterNetworkCallback(callback); connectivity.unregisterNetworkCallback(wifiCallback); connectivity.bindProcessToNetwork(null); if(web!=null) web.destroy(); super.onDestroy(); }
}
