#!/bin/sh
set -eu
# Only disposable native Docker sandboxes use docker0. Application services use
# the separate musuw-peter-services bridge. Allow public package downloads while
# keeping sandbox commands away from the host, application data and metadata.
iptables -N PETER-SANDBOX 2>/dev/null || true
iptables -F PETER-SANDBOX
for network in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  iptables -A PETER-SANDBOX -d "$network" -j REJECT
done
iptables -A PETER-SANDBOX -j RETURN
iptables -C DOCKER-USER -i docker0 -j PETER-SANDBOX 2>/dev/null || iptables -I DOCKER-USER 1 -i docker0 -j PETER-SANDBOX
iptables -C INPUT -i docker0 -j REJECT 2>/dev/null || iptables -I INPUT 1 -i docker0 -j REJECT
