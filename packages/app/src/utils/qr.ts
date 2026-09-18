export function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data)}`
}
