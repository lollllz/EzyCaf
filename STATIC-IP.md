# Static LAN IP for Kamil Hub

> **Assumption:** Kamil Hub runs on one device on the same private Wi-Fi/LAN as the phones and tablets. The router UI differs by brand, but the steps below are generic.

A stable IP keeps printed table QR codes working. If the router gives the Hub a new DHCP address after a reboot, QR links containing the old address stop working.

## Recommended: reserve the Hub's DHCP lease

1. Connect the Hub device to the intended Wi-Fi/Ethernet network.
2. Find its current LAN IPv4 address and MAC address.
3. Open the router's administration page and find **DHCP clients**, **LAN**, or **Address reservation**.
4. Add a reservation for that device's MAC address, choosing its current IPv4 address (or an unused address in the router's DHCP range).
5. Save/apply, reconnect or renew the Hub's network lease, and verify the address did not change.

This lets the router avoid conflicts while keeping the address stable. A manual static address on the Hub is also valid, but choose an unused address outside the DHCP pool and configure the correct gateway, subnet mask, and DNS.

Keep the Hub and Wi-Fi clients on the same subnet (for example, `192.168.1.x` with subnet mask `255.255.255.0`). Do not use the router's gateway address (often `.1`), the broadcast address (`.255` on a `/24`), or an address already assigned to another device. Guest Wi-Fi or client isolation may prevent phones from reaching the Hub even when the IP is correct.

## Find the current LAN IP

- **macOS:** `ipconfig getifaddr en0` (try `en1` if Wi-Fi is on another interface); or `route get default` to identify the active interface.
- **Windows (cmd):** `ipconfig` and read the active adapter's **IPv4 Address**.
- **Linux:** `hostname -I` or `ip route get 1.1.1.1` and read the `src` address.

After changing the reservation, run `start.sh` or `start.bat`; it prints the LAN URL. Reprint/update table QR codes only if the address or port changes.
