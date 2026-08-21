FROM golang:alpine AS builder
LABEL maintainer="joona@kuori.org"

RUN apk add --update gcc musl-dev git

WORKDIR /src
COPY . .
RUN CGO_ENABLED=1 CGO_CFLAGS="-D_LARGEFILE64_SOURCE" go build -o acme-dns

FROM alpine:latest

WORKDIR /root/
COPY --from=builder /src/acme-dns .
RUN mkdir -p /etc/acme-dns
RUN mkdir -p /var/lib/acme-dns
RUN apk --no-cache add ca-certificates && update-ca-certificates

VOLUME ["/etc/acme-dns", "/var/lib/acme-dns"]
ENTRYPOINT ["./acme-dns"]
EXPOSE 53 80 443
EXPOSE 53/udp
