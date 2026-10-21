#!/bin/sh
# Starts nginx (the page, the service and Hoistra's sign-in on one address, port 8080), then the Trace Lab service in
# the foreground, so the container stops when the service stops.
#
#   TRACE_LAB_NGINX=0   run the service only (port 8010), for a gateway that serves /lab/ and routes
#                       /backend/trace-lab/ itself.
#   HOISTRA_URL         Hoistra's address, e.g. https://hoistra.example.com (no trailing slash). Set it when Trace Lab
#                       has its own address, so /backend/ops-intelligence/ (sign-in) reaches Hoistra. Leave it unset
#                       behind Hoistra's own gateway, which already routes that path.
set -eu

# A command given to the container (docker run IMAGE python -m trace_lab.migrate status, the tests) runs instead.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

if [ "${TRACE_LAB_NGINX:-1}" = "1" ]; then
    cp /etc/trace-lab/nginx/default.conf.template /etc/nginx/conf.d/trace-lab.conf
    if [ -n "${HOISTRA_URL:-}" ]; then
        case "$HOISTRA_URL" in
            http://*|https://*) ;;
            *) echo "HOISTRA_URL must start with http:// or https://" >&2; exit 1 ;;
        esac
        # Hoistra's address is looked up per request with the container's own DNS server (IPv6 in brackets).
        ns="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)"
        case "$ns" in *:*) ns="[$ns]" ;; esac
        HOISTRA_URL="${HOISTRA_URL%/}" TRACE_LAB_RESOLVER="${TRACE_LAB_RESOLVER:-${ns:-127.0.0.11}}" \
            envsubst '${HOISTRA_URL} ${TRACE_LAB_RESOLVER}' < /etc/trace-lab/nginx/hoistra.conf.template \
            > /etc/nginx/trace-lab-hoistra.conf
    else
        : > /etc/nginx/trace-lab-hoistra.conf
    fi
    nginx -t -q
    nginx
fi

exec uvicorn trace_lab.app:app --host 0.0.0.0 --port 8010 --root-path /backend/trace-lab \
    --proxy-headers --forwarded-allow-ips='*'
