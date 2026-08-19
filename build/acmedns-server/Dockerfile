FROM golang:alpine AS builder
LABEL maintainer="joona@kuori.org"

RUN apk add --update gcc musl-dev git

ENV GOPATH /tmp/buildcache
RUN git clone https://github.com/joohoi/acme-dns /tmp/acme-dns
WORKDIR /tmp/acme-dns
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
