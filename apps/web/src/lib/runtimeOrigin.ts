function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function shouldAllowLoopbackFallbacks() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname, port } = window.location;
  if (protocol !== "http:") return false;
  if (!isLoopbackHostname(hostname)) return false;
  return port === "5173" || port === "4173";
}
