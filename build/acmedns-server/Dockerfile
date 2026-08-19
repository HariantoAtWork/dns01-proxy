FROM golang:alpine AS builder
LABEL maintainer="joona@kuori.org"

ARG ACMEDNS_REPO=https://github.com/acme-dns/acme-dns.git
ARG ACMEDNS_REF=master
# 1 = apply patch_txt_slots.py (upstream). 0 = fork already has 100 TXT slots.
ARG ACMEDNS_APPLY_PATCH=1

RUN apk add --update gcc musl-dev git python3

ENV GOPATH /tmp/buildcache
COPY patch_txt_slots.py /tmp/patch_txt_slots.py
RUN git clone --depth 1 --branch "${ACMEDNS_REF}" "${ACMEDNS_REPO}" /tmp/acme-dns
WORKDIR /tmp/acme-dns
RUN if [ "${ACMEDNS_APPLY_PATCH}" = "1" ]; then \
      python3 /tmp/patch_txt_slots.py pkg/database/db.go; \
    fi
RUN CGO_ENABLED=1 CGO_CFLAGS="-D_LARGEFILE64_SOURCE" go build
FROM alpine:latest

WORKDIR /root/
COPY --from=builder /tmp/acme-dns .
RUN mkdir -p /etc/acme-dns /var/lib/acme-dns /defaults
RUN rm -rf ./config.cfg
RUN apk --no-cache add ca-certificates && update-ca-certificates

COPY config.cfg.example /defaults/config.cfg
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/etc/acme-dns", "/var/lib/acme-dns"]
ENTRYPOINT ["/entrypoint.sh"]
EXPOSE 53 80 443
EXPOSE 53/udp
